import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';

type QueryRow = {
  id: string;
  body_text: string | null;
  status: string;
  posted_at: string | null;
};

export default function StudentHomeScreen({ navigation }: any) {
  const { t } = useLanguage();
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('queries')
      .select('id, body_text, status, posted_at')
      .eq('student_id', user.id)
      .neq('status', 'draft')
      .order('posted_at', { ascending: false });
    setQueries(data ?? []);
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, load]);

  const statusLabel = (status: string) =>
    status === 'posted' || status === 'searching'
      ? t('statusPosted')
      : status === 'assigned' || status === 'responding' || status === 'follow_up'
      ? t('statusAssigned')
      : status === 'resolved'
      ? t('statusResolved')
      : status;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t('askHeading')}</Text>

      <TouchableOpacity style={styles.askBox} onPress={() => navigation.navigate('AskQuestion')}>
        <Text style={styles.askBoxText}>{t('questionPlaceholder')}</Text>
      </TouchableOpacity>

      <FlatList
        style={{ marginTop: 20 }}
        data={queries}
        keyExtractor={(q) => q.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.queryCard}
            onPress={() => navigation.navigate('QueryDetail', { queryId: item.id })}
          >
            <Text style={styles.queryText} numberOfLines={2}>
              {item.body_text ?? '(photo question)'}
            </Text>
            <Text style={styles.queryStatus}>{statusLabel(item.status)}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 20 },
  heading: { fontSize: 26, fontWeight: '600', color: '#0F172A', marginBottom: 16 },
  askBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  askBoxText: { color: '#94A3B8', fontSize: 16 },
  queryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  queryText: { fontSize: 15, color: '#0F172A', marginBottom: 6 },
  queryStatus: { fontSize: 12, color: '#2563EB', fontWeight: '600' },
});
