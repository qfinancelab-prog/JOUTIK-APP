import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLanguage, SUPPORTED_LANGUAGES } from '../i18n/LanguageContext';

// Shown once, right after sign-in (see navigation/index.tsx), and
// reachable again later from a settings screen. Choosing a language
// here only changes app chrome — it does not restrict what language
// the student can actually type their question in, and it does not
// translate anything. See translations.ts for why that split exists.
export default function LanguageSelectScreen({ navigation }: any) {
  const { language, t, setLanguage } = useLanguage();

  const choose = async (code: 'en' | 'hi' | 'bn') => {
    await setLanguage(code);
    navigation.replace('StudentHome');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t('chooseLanguage')}</Text>
      <Text style={styles.subtitle}>{t('chooseLanguageSubtitle')}</Text>

      {SUPPORTED_LANGUAGES.map((lang) => (
        <TouchableOpacity
          key={lang.code}
          style={[styles.option, language === lang.code && styles.optionSelected]}
          onPress={() => choose(lang.code)}
        >
          <Text style={[styles.optionText, language === lang.code && styles.optionTextSelected]}>
            {lang.nativeLabel}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F8FAFC' },
  heading: { fontSize: 26, fontWeight: '600', color: '#0F172A', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#64748B', marginBottom: 32, lineHeight: 21 },
  option: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  optionSelected: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  optionText: { fontSize: 18, color: '#0F172A' },
  optionTextSelected: { color: '#2563EB', fontWeight: '600' },
});
