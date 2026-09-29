import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { translations, LanguageCode, SUPPORTED_LANGUAGES } from './translations';

const STORAGE_KEY = 'qfl_ui_language';

type LanguageContextValue = {
  language: LanguageCode;
  t: (key: keyof typeof translations['en']) => string;
  setLanguage: (lang: LanguageCode) => Promise<void>;
  ready: boolean;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      // Local cache first, for instant UI on app open — no need to
      // wait on a network round trip just to render buttons in the
      // right language.
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      if (cached && (cached === 'en' || cached === 'hi' || cached === 'bn')) {
        setLanguageState(cached as LanguageCode);
      }

      // Then reconcile with the server value, in case the user
      // changed language on another device.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('ui_language').eq('id', user.id).single();
        if (data?.ui_language && (data.ui_language === 'en' || data.ui_language === 'hi' || data.ui_language === 'bn')) {
          setLanguageState(data.ui_language as LanguageCode);
          await AsyncStorage.setItem(STORAGE_KEY, data.ui_language);
        }
      }
      setReady(true);
    })();
  }, []);

  const setLanguage = async (lang: LanguageCode) => {
    setLanguageState(lang);
    await AsyncStorage.setItem(STORAGE_KEY, lang);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // profiles.ui_language doubles as the default question_language
      // suggested on the Ask screen — kept as one field deliberately,
      // per product decision to keep this lightweight rather than
      // tracking interface language and content language separately.
      await supabase.from('profiles').update({ ui_language: lang }).eq('id', user.id);
    }
  };

  const t = (key: keyof typeof translations['en']) => translations[language][key];

  return (
    <LanguageContext.Provider value={{ language, t, setLanguage, ready }}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

export { SUPPORTED_LANGUAGES };
