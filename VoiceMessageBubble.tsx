import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { getSignedAttachmentUrl } from '../lib/attachments';
import { QueuedMessageStatus } from '../lib/messageQueue';

type Props = {
  isSelf: boolean;
  storagePath?: string;
  localUri?: string;
  durationSeconds?: number;
  status?: QueuedMessageStatus;
  onRetry?: () => void;
};

export default function VoiceMessageBubble({
  isSelf,
  storagePath,
  localUri,
  durationSeconds,
  status,
  onRetry,
}: Props) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      sound?.unloadAsync();
    };
  }, [sound]);

  const toggle = async () => {
    if (playing && sound) {
      await sound.pauseAsync();
      setPlaying(false);
      return;
    }

    if (sound) {
      await sound.playAsync();
      setPlaying(true);
      return;
    }

    setLoading(true);
    try {
      const uri = localUri ?? (storagePath ? await getSignedAttachmentUrl('query-voice', storagePath) : null);
      if (!uri) return;

      const { sound: newSound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      newSound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) setPlaying(false);
      });
      setSound(newSound);
      setPlaying(true);
    } finally {
      setLoading(false);
    }
  };

  const showStatus = status && status !== 'sent';

  return (
    <View style={[styles.bubble, isSelf ? styles.self : styles.other]}>
      <TouchableOpacity onPress={toggle} style={styles.playButton} disabled={loading}>
        {loading ? (
          <ActivityIndicator size="small" color={isSelf ? '#FFF' : '#2563EB'} />
        ) : (
          <Text style={[styles.playIcon, isSelf && styles.playIconSelf]}>{playing ? '⏸' : '▶'}</Text>
        )}
      </TouchableOpacity>
      <Text style={[styles.duration, isSelf && styles.durationSelf]}>
        {durationSeconds ? `${durationSeconds}s` : '🎙️'}
      </Text>
      {showStatus && (
        <TouchableOpacity onPress={status === 'failed' ? onRetry : undefined} style={styles.statusPill}>
          <Text style={styles.statusText}>
            {status === 'pending' ? '…' : status === 'uploading' ? '↑' : status === 'failed' ? '⟳ retry' : ''}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    maxWidth: '75%',
  },
  self: { backgroundColor: '#2563EB', alignSelf: 'flex-end' },
  other: { backgroundColor: '#FFFFFF', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#E2E8F0' },
  playButton: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  playIcon: { fontSize: 16, color: '#2563EB' },
  playIconSelf: { color: '#FFFFFF' },
  duration: { fontSize: 13, color: '#0F172A', marginLeft: 6 },
  durationSelf: { color: '#FFFFFF' },
  statusPill: { marginLeft: 8 },
  statusText: { fontSize: 11, color: '#F59E0B', fontWeight: '600' },
});
