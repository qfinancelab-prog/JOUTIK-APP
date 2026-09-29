import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';

// Email OTP for now — phone OTP is a straightforward swap later
// (supabase.auth.signInWithOtp({ phone })) once you've set up an
// SMS provider in the Supabase dashboard.
//
// Note on keyboards: this screen's email/OTP fields intentionally
// don't set a custom keyboardType beyond email-address/number-pad.
// For the question TextInput on AskQuestionScreen, the device's own
// keyboard — with whatever language/input method the user has
// selected at the OS level (Hindi, transliteration, etc.) — is used
// automatically. A plain multiline TextInput in React Native never
// restricts what script it accepts, so no extra work is needed
// there for multilingual typing to work.
export default function SignInScreen() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    if (!email.includes('@')) {
      Alert.alert('Enter a valid email');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (error) {
      Alert.alert('Could not send code', error.message);
      return;
    }
    setOtpSent(true);
  };

  const verifyOtp = async () => {
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setLoading(false);
    if (error) {
      Alert.alert('Invalid code', error.message);
    }
    // On success, the auth state listener in App.tsx handles navigation.
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('appTagline')}</Text>
      <Text style={styles.subtitle}>{t('signInSubtitle')}</Text>

      {!otpSent ? (
        <>
          <TextInput
            style={styles.input}
            placeholder={t('emailPlaceholder')}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TouchableOpacity style={styles.button} onPress={sendOtp} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? t('sending') : t('sendCode')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder={t('otpPlaceholder')}
            keyboardType="number-pad"
            value={token}
            onChangeText={setToken}
          />
          <TouchableOpacity style={styles.button} onPress={verifyOtp} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? t('verifying') : t('verifyAndContinue')}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F8FAFC' },
  title: { fontSize: 28, fontWeight: '600', color: '#0F172A', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#64748B', marginBottom: 32 },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  button: { backgroundColor: '#2563EB', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
