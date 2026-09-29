import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { uploadQueryAttachment } from './attachments';

export type QueuedMessageStatus = 'pending' | 'uploading' | 'sent' | 'failed';

export type QueuedMessage = {
  localOpId: string;
  kind: 'text' | 'voice';
  bodyText?: string;
  localUri?: string;
  sizeBytes?: number;
  durationMillis?: number;
  status: QueuedMessageStatus;
  createdAt: number;
  errorMessage?: string;
};

const storageKey = (queryId: string) => `qfl_msg_queue_${queryId}`;

// Why this exists: voice notes in particular are recorded on
// potentially weak mobile connections. A naive "insert and hope"
// approach means a dropped connection mid-upload either silently
// loses the recording or risks a duplicate message on manual retry.
// This queue makes every send idempotent (via local_op_id, see
// 020_messages_idempotency.sql) and durable (persisted to
// AsyncStorage, so a killed app doesn't lose a pending recording),
// and retries automatically when connectivity returns.
//
// Scope note: this covers messages within an already-open query
// (the teacher/student conversation). It does not cover offline
// query *creation* (the initial ask flow) — that's a larger piece
// of work (see joutik-app/README.md) and is intentionally not
// conflated with this slice.
export function useMessageQueue(queryId: string, senderId: string | null) {
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const queueRef = useRef<QueuedMessage[]>([]);

  const persist = useCallback(
    async (next: QueuedMessage[]) => {
      queueRef.current = next;
      setQueue(next);
      await AsyncStorage.setItem(storageKey(queryId), JSON.stringify(next));
    },
    [queryId]
  );

  const updateItem = useCallback(
    async (localOpId: string, patch: Partial<QueuedMessage>) => {
      const next = queueRef.current.map((item) =>
        item.localOpId === localOpId ? { ...item, ...patch } : item
      );
      await persist(next);
    },
    [persist]
  );

  const attemptSend = useCallback(
    async (item: QueuedMessage) => {
      if (!senderId) return;
      await updateItem(item.localOpId, { status: 'uploading', errorMessage: undefined });

      try {
        let attachmentId: string | null = null;

        if (item.kind === 'voice' && item.localUri) {
          const uploaded = await uploadQueryAttachment({
            queryId,
            kind: 'voice',
            localUri: item.localUri,
            sizeBytes: item.sizeBytes ?? 0,
            ownerRole: 'student',
            extension: 'm4a',
            durationSeconds: item.durationMillis ? Math.round(item.durationMillis / 1000) : undefined,
          });
          attachmentId = uploaded.attachmentId;
        }

        const { error } = await supabase.from('messages').insert({
          query_id: queryId,
          sender_id: senderId,
          kind: item.kind,
          body_text: item.kind === 'text' ? item.bodyText : null,
          attachment_id: attachmentId,
          local_op_id: item.localOpId,
        });

        if (error) {
          // A unique_violation here means this exact local_op_id was
          // already inserted by an earlier attempt whose success
          // response we simply never received (e.g. connection died
          // right after the server committed). That's not a failure
          // — it's confirmation the send already succeeded, so treat
          // it as success rather than surfacing an error and letting
          // the user retry into a genuine duplicate.
          if ((error as any).code === '23505') {
            await updateItem(item.localOpId, { status: 'sent' });
            return;
          }
          throw error;
        }

        await updateItem(item.localOpId, { status: 'sent' });
      } catch (err: any) {
        await updateItem(item.localOpId, { status: 'failed', errorMessage: err.message ?? 'send_failed' });
      }
    },
    [queryId, senderId, updateItem]
  );

  // Load any queue left over from a previous session (app killed
  // mid-send, etc.) and retry whatever wasn't confirmed sent.
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(storageKey(queryId));
      const stored: QueuedMessage[] = raw ? JSON.parse(raw) : [];
      const unresolved = stored.filter((item) => item.status !== 'sent');
      queueRef.current = stored;
      setQueue(stored);

      for (const item of unresolved) {
        attemptSend(item);
      }
    })();
    // Deliberately run once per queryId — attemptSend is stable
    // enough within a mount for this purpose (see updateItem's
    // functional persist pattern, which doesn't depend on stale
    // closures over `queue`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryId]);

  // Auto-retry failed/pending items when connectivity returns.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        const toRetry = queueRef.current.filter((item) => item.status === 'failed' || item.status === 'pending');
        toRetry.forEach(attemptSend);
      }
    });
    return () => unsubscribe();
  }, [attemptSend]);

  const sendText = useCallback(
    async (bodyText: string) => {
      const item: QueuedMessage = {
        localOpId: crypto.randomUUID(),
        kind: 'text',
        bodyText,
        status: 'pending',
        createdAt: Date.now(),
      };
      await persist([...queueRef.current, item]);
      attemptSend(item);
    },
    [persist, attemptSend]
  );

  const sendVoice = useCallback(
    async (localUri: string, sizeBytes: number, durationMillis: number) => {
      const item: QueuedMessage = {
        localOpId: crypto.randomUUID(),
        kind: 'voice',
        localUri,
        sizeBytes,
        durationMillis,
        status: 'pending',
        createdAt: Date.now(),
      };
      await persist([...queueRef.current, item]);
      attemptSend(item);
    },
    [persist, attemptSend]
  );

  const retry = useCallback(
    (localOpId: string) => {
      const item = queueRef.current.find((i) => i.localOpId === localOpId);
      if (item) attemptSend(item);
    },
    [attemptSend]
  );

  // Once a queued item is confirmed present in the real messages
  // list (matched by local_op_id), the caller should call this to
  // stop showing it as a separate "sending..." bubble — the real
  // message from the messages table takes over rendering it.
  const clearSent = useCallback(
    async (confirmedLocalOpIds: string[]) => {
      const next = queueRef.current.filter((item) => !confirmedLocalOpIds.includes(item.localOpId));
      await persist(next);
    },
    [persist]
  );

  return { queue, sendText, sendVoice, retry, clearSent };
}
