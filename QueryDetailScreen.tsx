import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import { useMessageQueue } from '../lib/messageQueue';
import { startRecording, stopRecording, cancelRecording } from '../lib/voiceRecorder';
import VoiceMessageBubble from '../components/VoiceMessageBubble';
import { CLIENT_LIMITS } from '../lib/attachments';

type Message = {
  id: string;
  sender_id: string | null;
  kind: string;
  body_text: string | null;
  local_op_id: string | null;
  created_at: string;
  query_attachments: { storage_path: string; duration_seconds: number | null } | null;
};

type TeacherProfile = {
  display_name: string;
  institution_name: string | null;
  badges: string[];
  resolved_count: number;
};

const MAX_RECORDING_SECONDS = 90; // matches max_voice_bytes at HIGH_QUALITY encoding, roughly

export default function QueryDetailScreen({ route }: any) {
  const { queryId } = route.params;
  const { t } = useLanguage();
  const [status, setStatus] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile | null>(null);
  const [draft, setDraft] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const { queue, sendText, sendVoice, retry, clearSent } = useMessageQueue(queryId, userId);

  const loadQuery = useCallback(async () => {
    const { data: query } = await supabase.from('queries').select('status').eq('id', queryId).single();
    if (query) setStatus(query.status);

    const { data: assignment } = await supabase
      .from('assignments')
      .select('teacher_id')
      .eq('query_id', queryId)
      .maybeSingle();

    if (assignment?.teacher_id) {
      const { data: profileRows } = await supabase.rpc('get_teacher_public_profile', {
        p_teacher_id: assignment.teacher_id,
      });
      const profile = profileRows?.[0];
      if (profile) {
        setTeacherProfile({
          display_name: profile.display_name,
          institution_name: profile.institution_name,
          badges: profile.badges ?? [],
          resolved_count: profile.resolved_count ?? 0,
        });
      }
    }
  }, [queryId]);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, kind, body_text, local_op_id, created_at, query_attachments(storage_path, duration_seconds)')
      .eq('query_id', queryId)
      .order('created_at', { ascending: true });

    const rows = (data ?? []) as unknown as Message[];
    setMessages(rows);

    // Any queued item now confirmed present in the real messages
    // list can stop being rendered as a separate "sending" bubble.
    const confirmedOpIds = rows.map((m) => m.local_op_id).filter(Boolean) as string[];
    if (confirmedOpIds.length > 0) clearSent(confirmedOpIds);
  }, [queryId, clearSent]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      await Promise.all([loadQuery(), loadMessages()]);
    })();

    const channel = supabase
      .channel(`query-${queryId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `query_id=eq.${queryId}` },
        () => loadMessages()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'queries', filter: `id=eq.${queryId}` },
        () => loadQuery()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryId, loadQuery, loadMessages]);

  // Recording timer + auto-stop at the max duration, so a forgotten
  // open mic doesn't produce a file that blows past max_voice_bytes
  // and gets rejected server-side after the fact.
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setRecordSeconds((s) => {
        if (s + 1 >= MAX_RECORDING_SECONDS) {
          finishRecording();
          return 0;
        }
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  const beginRecording = async () => {
    try {
      await startRecording();
      setIsRecording(true);
      setRecordSeconds(0);
    } catch (err: any) {
      if (err.message === 'microphone_permission_denied') {
        Alert.alert('Microphone permission needed');
      } else {
        Alert.alert(t('somethingWentWrong'), err.message ?? '');
      }
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
      await sendVoice(uri, sizeBytes, durationMillis);
    } catch (err: any) {
      Alert.alert(t('somethingWentWrong'), err.message ?? '');
    }
  };

  const discardRecording = async () => {
    setIsRecording(false);
    setRecordSeconds(0);
    await cancelRecording();
  };

  const sendMessage = async () => {
    if (!draft.trim()) return;
    const text = draft.trim();
    setDraft('');
    await sendText(text);
  };

  const resolve = async (wasHelpful: boolean) => {
    const { data, error } = await supabase.rpc('resolve_query', {
      p_query_id: queryId,
      p_was_helpful: wasHelpful,
    });
    if (error || !data?.[0]?.success) {
      Alert.alert(t('somethingWentWrong'), error?.message ?? data?.[0]?.message ?? '');
      return;
    }
    await loadQuery();
  };

  const statusLabel =
    status === 'posted' || status === 'searching'
      ? t('statusPosted')
      : status === 'assigned'
      ? t('statusAssigned')
      : status === 'resolved'
      ? t('statusResolved')
      : status;

  // Merge confirmed messages with still-pending queued items into
  // one chronological list for rendering.
  type Row =
    | { type: 'message'; data: Message }
    | { type: 'queued'; data: (typeof queue)[number] };

  const rows: Row[] = [
    ...messages.map((m) => ({ type: 'message' as const, data: m })),
    ...queue.filter((q) => q.status !== 'sent').map((q) => ({ type: 'queued' as const, data: q })),
  ].sort((a, b) => {
    const aTime = a.type === 'message' ? new Date(a.data.created_at).getTime() : a.data.createdAt;
    const bTime = b.type === 'message' ? new Date(b.data.created_at).getTime() : b.data.createdAt;
    return aTime - bTime;
  });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.statusBanner}>{statusLabel}</Text>

      {teacherProfile && (
        <View style={styles.teacherCard}>
          <Text style={styles.teacherName}>{teacherProfile.display_name}</Text>
          {teacherProfile.institution_name && (
            <Text style={styles.teacherInstitution}>{teacherProfile.institution_name}</Text>
          )}
          <View style={styles.badgeRow}>
            {teacherProfile.badges.map((badge) => (
              <View key={badge} style={styles.badge}>
                <Text style={styles.badgeText}>{badge.replace(/_/g, ' ')}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(row) => (row.type === 'message' ? row.data.id : row.data.localOpId)}
        style={styles.messageList}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          if (item.type === 'message') {
            const m = item.data;
            const isSelf = m.sender_id === userId;
            if (m.kind === 'voice' && m.query_attachments) {
              return (
                <VoiceMessageBubble
                  isSelf={isSelf}
                  storagePath={m.query_attachments.storage_path}
                  durationSeconds={m.query_attachments.duration_seconds ?? undefined}
                />
              );
            }
            return (
              <View style={[styles.messageBubble, isSelf ? styles.messageBubbleSelf : styles.messageBubbleOther]}>
                <Text style={isSelf ? styles.messageTextSelf : styles.messageTextOther}>{m.body_text}</Text>
              </View>
            );
          }

          // queued (not yet confirmed) item
          const q = item.data;
          if (q.kind === 'voice') {
            return (
              <VoiceMessageBubble
                isSelf
                localUri={q.localUri}
                durationSeconds={q.durationMillis ? Math.round(q.durationMillis / 1000) : undefined}
                status={q.status}
                onRetry={() => retry(q.localOpId)}
              />
            );
          }
          return (
            <View style={[styles.messageBubble, styles.messageBubbleSelf, q.status === 'failed' && styles.failedBubble]}>
              <Text style={styles.messageTextSelf}>{q.bodyText}</Text>
              {q.status !== 'sent' && (
                <TouchableOpacity onPress={() => q.status === 'failed' && retry(q.localOpId)}>
                  <Text style={styles.queuedStatusText}>
                    {q.status === 'pending' ? '…' : q.status === 'uploading' ? 'sending...' : '⟳ tap to retry'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {(status === 'responding' || status === 'follow_up') && (
        <View style={styles.resolveRow}>
          <Text style={styles.resolveLabel}>{t('wasThisHelpful')}</Text>
          <TouchableOpacity style={styles.resolveButton} onPress={() => resolve(true)}>
            <Text style={styles.resolveButtonText}>{t('yesUnderstood')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        {isRecording ? (
          <View style={styles.recordingRow}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTime}>
              {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}
            </Text>
            <TouchableOpacity onPress={discardRecording} style={styles.recordingCancel}>
              <Text style={styles.recordingCancelText}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={finishRecording} style={styles.recordingSend}>
              <Text style={styles.recordingSendText}>Send</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder={t('typeYourAnswer')}
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            {draft.trim() ? (
              <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
                <Text style={styles.sendButtonText}>{t('sendAnswer')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.micButton} onPress={beginRecording}>
                <Text style={styles.micIcon}>🎙️</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  statusBanner: { textAlign: 'center', padding: 10, fontSize: 13, color: '#64748B', backgroundColor: '#EFF6FF' },
  teacherCard: { margin: 16, padding: 16, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  teacherName: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  teacherInstitution: { fontSize: 13, color: '#64748B', marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badge: { backgroundColor: '#F0FDF4', borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8 },
  badgeText: { fontSize: 11, color: '#16A34A', fontWeight: '600' },
  messageList: { flex: 1 },
  messageBubble: { maxWidth: '80%', borderRadius: 14, padding: 12, marginBottom: 8 },
  messageBubbleSelf: { backgroundColor: '#2563EB', alignSelf: 'flex-end' },
  messageBubbleOther: { backgroundColor: '#FFFFFF', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#E2E8F0' },
  failedBubble: { opacity: 0.6 },
  messageTextSelf: { color: '#FFFFFF' },
  messageTextOther: { color: '#0F172A' },
  queuedStatusText: { color: '#FDE68A', fontSize: 11, marginTop: 4 },
  resolveRow: { padding: 12, alignItems: 'center' },
  resolveLabel: { fontSize: 13, color: '#64748B', marginBottom: 8 },
  resolveButton: { backgroundColor: '#16A34A', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16 },
  resolveButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  inputRow: { flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0', alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', maxHeight: 100 },
  sendButton: { backgroundColor: '#2563EB', borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center', height: 44 },
  sendButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  micButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
  micIcon: { fontSize: 18 },
  recordingRow: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 10, gap: 10 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#DC2626' },
  recordingTime: { flex: 1, color: '#0F172A', fontSize: 14, fontWeight: '600' },
  recordingCancel: { paddingHorizontal: 10 },
  recordingCancelText: { color: '#64748B', fontSize: 16 },
  recordingSend: { backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  recordingSendText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
