import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { compressImage, uploadQueryAttachment, CLIENT_LIMITS } from '../lib/attachments';
import { startRecording, stopRecording, cancelRecording } from '../lib/voiceRecorder';
import { useLanguage } from '../i18n/LanguageContext';

type Subject = { id: string; code: string; label_en: string };
type PendingAttachment =
  | { kind: 'image'; uri: string; sizeBytes: number }
  | { kind: 'voice'; uri: string; sizeBytes: number; durationMillis: number };

// This screen deliberately follows the exact sequence the backend
// contract requires (see joutik-backend/README.md):
//   1. insert a draft query
//   2. upload attachments referencing that query's id
//   3. call post_query() to finalize
// Doing it in any other order, or skipping post_query(), will leave
// the query stuck in 'draft' — it will never appear in any teacher's
// feed, since teacher_feed only shows 'posted'/'searching' queries.
export default function AskQuestionScreen({ navigation }: any) {
  const { t, language } = useLanguage();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [bodyText, setBodyText] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  useEffect(() => {
    supabase
      .from('subjects')
      .select('id, code, label_en')
      .eq('is_active', true)
      .then(({ data, error }) => {
        if (error) {
          console.warn('Failed to load subjects', error);
          return;
        }
        setSubjects(data ?? []);
      });
  }, []);

  const addPhoto = async () => {
    if (attachments.length >= CLIENT_LIMITS.maxAttachmentsPerQuery) {
      Alert.alert('Limit reached', `You can add up to ${CLIENT_LIMITS.maxAttachmentsPerQuery} attachments.`);
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission needed');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (result.canceled) return;

    try {
      const compressed = await compressImage(result.assets[0].uri);
      setAttachments((prev) => [...prev, { kind: 'image', ...compressed }]);
    } catch {
      Alert.alert("Couldn't process that photo", 'Please try a different one.');
    }
  };

  const beginRecording = async () => {
    if (attachments.length >= CLIENT_LIMITS.maxAttachmentsPerQuery) {
      Alert.alert('Limit reached', `You can add up to ${CLIENT_LIMITS.maxAttachmentsPerQuery} attachments.`);
      return;
    }
    try {
      await startRecording();
      setIsRecording(true);
      setRecordSeconds(0);
    } catch (err: any) {
      Alert.alert(err.message === 'microphone_permission_denied' ? 'Microphone permission needed' : t('somethingWentWrong'));
    }
  };

  const finishRecording = async () => {
    setIsRecording(false);
    try {
      const { uri, durationMillis, sizeBytes } = await stopRecording();
      if (sizeBytes > CLIENT_LIMITS.maxVoiceBytes) {
        Alert.alert('Recording too long', 'Please record a shorter voice note.');
        return;
      }
      setAttachments((prev) => [...prev, { kind: 'voice', uri, sizeBytes, durationMillis }]);
    } catch (err: any) {
      Alert.alert(t('somethingWentWrong'), err.message ?? '');
    }
  };

  const discardRecording = async () => {
    setIsRecording(false);
    setRecordSeconds(0);
    await cancelRecording();
  };

  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setRecordSeconds((s) => {
        if (s + 1 >= 90) {
          finishRecording();
          return 0;
        }
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!subjectId) {
      Alert.alert('Pick a subject first');
      return;
    }
    if (!bodyText.trim() && attachments.length === 0) {
      Alert.alert('Add a question or a photo before asking');
      return;
    }

    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('not_authenticated');

      // Step 1: draft query
      const { data: query, error: insertError } = await supabase
        .from('queries')
        .insert({
          student_id: user.id,
          subject_id: subjectId,
          body_text: bodyText.trim() || null,
          question_language: language, // drives teacher matching (019_language_matching.sql) —
                                        // no translation happens anywhere; this just makes sure
                                        // only teachers who registered this language see it
          status: 'draft',
        })
        .select('id')
        .single();

      if (insertError || !query) throw insertError ?? new Error('query_insert_failed');

      // Step 2: attachments, one at a time so a single failure is
      // easy to attribute to a specific file rather than a batch.
      for (const attachment of attachments) {
        if (attachment.kind === 'image') {
          await uploadQueryAttachment({
            queryId: query.id,
            kind: 'image',
            localUri: attachment.uri,
            sizeBytes: attachment.sizeBytes,
            ownerRole: 'student',
            extension: 'jpg',
          });
        } else {
          await uploadQueryAttachment({
            queryId: query.id,
            kind: 'voice',
            localUri: attachment.uri,
            sizeBytes: attachment.sizeBytes,
            ownerRole: 'student',
            extension: 'm4a',
            durationSeconds: Math.round(attachment.durationMillis / 1000),
          });
        }
      }

      // Step 3: finalize. This is what actually spends a free-tier
      // slot or a credit and makes the query visible to teachers.
      const { data: postResult, error: postError } = await supabase.rpc('post_query', {
        p_query_id: query.id,
      });

      if (postError) throw postError;

      const outcome = postResult?.[0];
      if (!outcome?.success) {
        if (outcome?.message === 'insufficient_credits') {
          Alert.alert(t('outOfFreeQuestions'), t('outOfFreeQuestionsBody'));
        } else {
          Alert.alert(t('somethingWentWrong'), outcome?.message ?? '');
        }
        return;
      }

      setBodyText('');
      setAttachments([]);
      navigation.navigate('QueryDetail', { queryId: query.id });
    } catch (err: any) {
      Alert.alert(t('somethingWentWrong'), err.message ?? '');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.heading}>{t('askHeading')}</Text>

      <TextInput
        style={styles.input}
        placeholder={t('questionPlaceholder')}
        multiline
        value={bodyText}
        onChangeText={setBodyText}
      />

      <View style={styles.attachRow}>
        <TouchableOpacity style={styles.attachButton} onPress={addPhoto}>
          <Text style={styles.attachButtonText}>📷 {t('addPhoto')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.attachButton} onPress={beginRecording}>
          <Text style={styles.attachButtonText}>🎙️ Voice</Text>
        </TouchableOpacity>
      </View>

      {isRecording && (
        <View style={styles.recordingRow}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingTime}>
            {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}
          </Text>
          <TouchableOpacity onPress={discardRecording}>
            <Text style={styles.recordingCancelText}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={finishRecording} style={styles.recordingSend}>
            <Text style={styles.recordingSendText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {attachments.length > 0 && (
        <Text style={styles.attachmentCount}>{attachments.length} {t('photosAdded')}</Text>
      )}
      {attachments.map((a, i) => (
        <TouchableOpacity key={i} onPress={() => removeAttachment(i)}>
          <Text style={styles.removeText}>
            {t('removePhoto')} {a.kind === 'voice' ? '🎙️' : '📷'} {i + 1}
          </Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.label}>{t('subjectLabel')}</Text>
      <View style={styles.subjectRow}>
        {subjects.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.subjectChip, subjectId === s.id && styles.subjectChipSelected]}
            onPress={() => setSubjectId(s.id)}
          >
            <Text style={[styles.subjectChipText, subjectId === s.id && styles.subjectChipTextSelected]}>
              {s.label_en}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.submitButton} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitButtonText}>{t('ask')}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  heading: { fontSize: 24, fontWeight: '600', color: '#0F172A', marginBottom: 16 },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  attachRow: { flexDirection: 'row', marginBottom: 12 },
  attachButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  attachButtonText: { fontSize: 14, color: '#0F172A' },
  attachmentCount: { fontSize: 13, color: '#64748B', marginBottom: 4 },
  removeText: { fontSize: 13, color: '#DC2626', marginBottom: 4 },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 10,
    gap: 10,
    marginBottom: 12,
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#DC2626' },
  recordingTime: { flex: 1, color: '#0F172A', fontSize: 14, fontWeight: '600' },
  recordingCancelText: { color: '#64748B', fontSize: 16, paddingHorizontal: 8 },
  recordingSend: { backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  recordingSendText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: '#0F172A', marginTop: 16, marginBottom: 8 },
  subjectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  subjectChip: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subjectChipSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  subjectChipText: { color: '#0F172A', fontSize: 14 },
  subjectChipTextSelected: { color: '#FFFFFF' },
  submitButton: { backgroundColor: '#2563EB', borderRadius: 14, padding: 16, alignItems: 'center' },
  submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
