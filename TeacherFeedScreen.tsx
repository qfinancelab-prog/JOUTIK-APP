import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../i18n/LanguageContext';

type FeedItem = {
  query_id: string;
  subject_label: string;
  topic_label: string | null;
  level: string | null;
  body_text: string | null;
  question_language: string;
  status: string;
  posted_at: string;
  attachment_count: number;
};

type Availability = 'available' | 'later' | 'offline';

// This screen does not implement its own matching logic — it just
// reads public.teacher_feed, which is already scoped by subject AND
// language via RLS on the underlying queries table
// (019_language_matching.sql). If a query doesn't show up here,
// that's the database deciding it's not a match, not a client-side
// filter — worth remembering when debugging "why can't I see this
// question" reports later.
export default function TeacherFeedScreen({ navigation }: any) {
  const { t } = useLanguage();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability>('available');

  const loadFeed = useCallback(async () => {
    const { data, error } = await supabase
      .from('teacher_feed')
      .select('*')
      .order('posted_at', { ascending: true });
    if (error) {
      console.warn('Failed to load feed', error);
      return;
    }
    setItems(data ?? []);
  }, []);

  const loadAvailability = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('teacher_profiles').select('availability').eq('id', user.id).single();
    if (data?.availability) setAvailability(data.availability);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadFeed(), loadAvailability()]);
      setLoading(false);
    })();

    // Live updates: re-fetch whenever any query changes status —
    // simplest correct approach for V1. A finer-grained realtime
    // subscription (only re-fetch on inserts matching this teacher's
    // subjects) is a reasonable later optimization, not a correctness
    // requirement right now.
    const channel = supabase
      .channel('queries-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queries' }, () => {
        loadFeed();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadFeed, loadAvailability]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFeed();
    setRefreshing(false);
  };

  const changeAvailability = async (status: Availability) => {
    setAvailability(status);
    await supabase.rpc('set_availability', { p_status: status });
  };

  const accept = async (queryId: string) => {
    setAcceptingId(queryId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('not_authenticated');

      const { data, error } = await supabase.functions.invoke('accept-query', {
        body: { query_id: queryId },
      });

      if (error) {
        // 409 (already taken / not open) surfaces here too —
        // supabase-js treats non-2xx as an error, so check both paths.
        const reason = (error as any)?.context?.body?.reason ?? data?.reason;
        if (reason === 'already_assigned') {
          Alert.alert(t('alreadyAssigned'));
        } else {
          Alert.alert(t('somethingWentWrong'), reason ?? error.message);
        }
        await loadFeed();
        return;
      }

      navigation.navigate('QueryDetail', { queryId });
    } catch (err: any) {
      Alert.alert(t('somethingWentWrong'), err.message ?? '');
    } finally {
      setAcceptingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t('teacherFeedHeading')}</Text>

      <Text style={styles.label}>{t('yourAvailability')}</Text>
      <View style={styles.availabilityRow}>
        {(['available', 'later', 'offline'] as Availability[]).map((status) => (
          <TouchableOpacity
            key={status}
            style={[styles.availChip, availability === status && styles.availChipSelected]}
            onPress={() => changeAvailability(status)}
          >
            <Text style={[styles.availChipText, availability === status && styles.availChipTextSelected]}>
              {status === 'available' ? t('availableNow') : status === 'later' ? t('availableLater') : t('offline')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.query_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('noOpenQueries')}</Text>}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.subjectText}>
              {item.subject_label}
              {item.topic_label ? ` · ${item.topic_label}` : ''}
              {item.level ? ` · ${item.level}` : ''}
            </Text>
            {item.body_text ? <Text style={styles.bodyText}>{item.body_text}</Text> : null}
            {item.attachment_count > 0 && (
              <Text style={styles.metaText}>
                {item.attachment_count} {t('attachmentsCount')}
              </Text>
            )}
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={() => accept(item.query_id)}
              disabled={acceptingId === item.query_id}
            >
              {acceptingId === item.query_id ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.acceptButtonText}>{t('accept')}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
  heading: { fontSize: 24, fontWeight: '600', color: '#0F172A', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#64748B', marginBottom: 8 },
  availabilityRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  availChip: {
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  availChipSelected: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  availChipText: { color: '#0F172A', fontSize: 13 },
  availChipTextSelected: { color: '#FFFFFF' },
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 40, fontSize: 15 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subjectText: { fontSize: 13, fontWeight: '600', color: '#2563EB', marginBottom: 6 },
  bodyText: { fontSize: 15, color: '#0F172A', marginBottom: 8, lineHeight: 21 },
  metaText: { fontSize: 12, color: '#94A3B8', marginBottom: 12 },
  acceptButton: { backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  acceptButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
