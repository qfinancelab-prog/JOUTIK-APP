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
import { supabase } from '../lib/supabase';
import { useLanguage, SUPPORTED_LANGUAGES } from '../i18n/LanguageContext';

type Subject = { id: string; code: string; label_en: string };

// The language chips here are what actually connects a teacher to
// matching students (019_language_matching.sql): a teacher who
// registers Hindi will only be shown queries where the student
// asked in Hindi. No translation happens on either side — the
// teacher answers in whatever language they registered for,
// because they already know it.
export default function TeacherOnboardingScreen({ navigation }: any) {
  const { t } = useLanguage();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set());
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());
  const [institutionName, setInstitutionName] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('subjects')
      .select('id, code, label_en')
      .eq('is_active', true)
      .then(({ data }) => setSubjects(data ?? []));
  }, []);

  const toggleSubject = (id: string) => {
    setSelectedSubjectIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleLanguage = (code: string) => {
    setSelectedLanguages((prev) => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const save = async () => {
    if (selectedSubjectIds.size === 0) {
      Alert.alert(t('selectSubjects'));
      return;
    }
    if (selectedLanguages.size === 0) {
      Alert.alert(t('selectLanguages'));
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('not_authenticated');

      // Step 1: create the teacher profile + role change, atomically
      // (see become_teacher() in 016_teacher_onboarding_functions.sql).
      const { data: result, error: becomeError } = await supabase.rpc('become_teacher', {
        p_institution_name: institutionName.trim() || null,
        p_years_experience: yearsExperience ? parseInt(yearsExperience, 10) : null,
        p_bio: bio.trim() || null,
      });
      if (becomeError) throw becomeError;

      const outcome = result?.[0];
      if (!outcome?.success && outcome?.message !== 'already_a_teacher') {
        throw new Error(outcome?.message ?? 'unknown_error');
      }

      // Step 2: subject registration — self-service (RLS allows this
      // directly; SME badge is a separate, admin-only flag).
      const subjectRows = Array.from(selectedSubjectIds).map((subject_id) => ({
        teacher_id: user.id,
        subject_id,
      }));
      const { error: subjectError } = await supabase
        .from('teacher_subjects')
        .upsert(subjectRows, { onConflict: 'teacher_id,subject_id', ignoreDuplicates: true });
      if (subjectError) throw subjectError;

      // Step 3: language registration — this is the piece that makes
      // "map teacher accordingly" actually work in the feed.
      const languageRows = Array.from(selectedLanguages).map((language_code) => ({
        teacher_id: user.id,
        language_code,
      }));
      const { error: languageError } = await supabase
        .from('teacher_languages')
        .upsert(languageRows, { onConflict: 'teacher_id,language_code', ignoreDuplicates: true });
      if (languageError) throw languageError;

      navigation.replace('TeacherFeed');
    } catch (err: any) {
      Alert.alert(t('somethingWentWrong'), err.message ?? '');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.heading}>{t('becomeTeacherHeading')}</Text>

      <TextInput
        style={styles.input}
        placeholder={t('institutionPlaceholder')}
        value={institutionName}
        onChangeText={setInstitutionName}
      />
      <TextInput
        style={styles.input}
        placeholder={t('yearsExperiencePlaceholder')}
        keyboardType="number-pad"
        value={yearsExperience}
        onChangeText={setYearsExperience}
      />
      <TextInput
        style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
        placeholder={t('bioPlaceholder')}
        multiline
        value={bio}
        onChangeText={setBio}
      />

      <Text style={styles.label}>{t('selectSubjects')}</Text>
      <View style={styles.chipRow}>
        {subjects.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.chip, selectedSubjectIds.has(s.id) && styles.chipSelected]}
            onPress={() => toggleSubject(s.id)}
          >
            <Text style={[styles.chipText, selectedSubjectIds.has(s.id) && styles.chipTextSelected]}>
              {s.label_en}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{t('selectLanguages')}</Text>
      <View style={styles.chipRow}>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <TouchableOpacity
            key={lang.code}
            style={[styles.chip, selectedLanguages.has(lang.code) && styles.chipSelected]}
            onPress={() => toggleLanguage(lang.code)}
          >
            <Text style={[styles.chipText, selectedLanguages.has(lang.code) && styles.chipTextSelected]}>
              {lang.nativeLabel}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.submitButton} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitButtonText}>{t('saveAndContinue')}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  heading: { fontSize: 24, fontWeight: '600', color: '#0F172A', marginBottom: 16 },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  label: { fontSize: 14, fontWeight: '600', color: '#0F172A', marginTop: 12, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { color: '#0F172A', fontSize: 14 },
  chipTextSelected: { color: '#FFFFFF' },
  submitButton: { backgroundColor: '#2563EB', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
