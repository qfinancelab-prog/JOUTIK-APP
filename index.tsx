import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import SignInScreen from '../screens/SignInScreen';
import LanguageSelectScreen from '../screens/LanguageSelectScreen';
import StudentHomeScreen from '../screens/StudentHomeScreen';
import AskQuestionScreen from '../screens/AskQuestionScreen';
import QueryDetailScreen from '../screens/QueryDetailScreen';
import TeacherFeedScreen from '../screens/TeacherFeedScreen';
import TeacherOnboardingScreen from '../screens/TeacherOnboardingScreen';

const Stack = createNativeStackNavigator();

// Routing logic, deliberately simple: a signed-in user with no
// ui_language set yet sees LanguageSelectScreen first (this is the
// "must choose language before anything else" requirement); after
// that, role decides the home screen. Switching between student and
// teacher mode isn't handled here yet — that's a reasonable next
// addition once someone actually needs to test both roles on one
// account, which isn't a blocker for verifying the core loop works.
export default function AppNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsLanguage, setNeedsLanguage] = useState(false);
  const [role, setRole] = useState<'student' | 'teacher' | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('role, ui_language')
        .eq('id', session.user.id)
        .single();

      setRole((data?.role as 'student' | 'teacher') ?? 'student');
      // ui_language defaults to 'en' at the database level (see
      // handle_new_user() in 001_schema.sql), so a genuinely
      // first-time user has never been asked — we treat "never
      // explicitly chosen" as a local flag rather than trying to
      // infer it from the default value, since 'en' is also a valid
      // real choice.
      const chosenBefore = await import('@react-native-async-storage/async-storage').then((m) =>
        m.default.getItem('qfl_ui_language')
      );
      setNeedsLanguage(!chosenBefore);
    })();
  }, [session]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="SignIn" component={SignInScreen} />
        ) : needsLanguage ? (
          <Stack.Screen name="LanguageSelect" component={LanguageSelectScreen} />
        ) : role === 'teacher' ? (
          <>
            <Stack.Screen name="TeacherFeed" component={TeacherFeedScreen} options={{ headerShown: true, title: '' }} />
            <Stack.Screen name="QueryDetail" component={QueryDetailScreen} options={{ headerShown: true, title: '' }} />
            <Stack.Screen
              name="TeacherOnboarding"
              component={TeacherOnboardingScreen}
              options={{ headerShown: true, title: '' }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="StudentHome" component={StudentHomeScreen} options={{ headerShown: true, title: '' }} />
            <Stack.Screen name="AskQuestion" component={AskQuestionScreen} options={{ headerShown: true, title: '' }} />
            <Stack.Screen name="QueryDetail" component={QueryDetailScreen} options={{ headerShown: true, title: '' }} />
            <Stack.Screen
              name="TeacherOnboarding"
              component={TeacherOnboardingScreen}
              options={{ headerShown: true, title: '' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
