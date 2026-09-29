import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from './supabase';

// These mirror the defaults in platform_settings (006_platform_settings.sql).
// Client-side limits exist purely for instant UX feedback and to avoid
// wasting upload bandwidth on oversized files — the database trigger
// (007_attachment_limits_trigger.sql) is the real, unbypassable limit.
// If you change the server-side settings, update these to match so the
// user doesn't get a confusing late rejection after a slow upload.
export const CLIENT_LIMITS = {
  maxImageBytes: 2 * 1024 * 1024,
  maxVoiceBytes: 1.5 * 1024 * 1024,
  maxDocumentBytes: 3 * 1024 * 1024,
  maxAttachmentsPerQuery: 5,
};

const BUCKET_BY_KIND = {
  image: 'query-images',
  voice: 'query-voice',
  document: 'query-documents',
} as const;

export type AttachmentKind = keyof typeof BUCKET_BY_KIND;

/**
 * Compresses an image down toward the target size by progressively
 * reducing quality and dimensions. Returns the final local URI and
 * its size — never guarantees hitting the exact limit, but gets
 * close enough that the server-side trigger essentially never
 * rejects a normal photo.
 */
export async function compressImage(uri: string): Promise<{ uri: string; sizeBytes: number }> {
  let quality = 0.7;
  let width = 1600;

  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );

    const info = await fetch(result.uri);
    const blob = await info.blob();

    if (blob.size <= CLIENT_LIMITS.maxImageBytes || attempt === 3) {
      return { uri: result.uri, sizeBytes: blob.size };
    }

    // Still too big — shrink further and try again.
    quality = Math.max(0.4, quality - 0.15);
    width = Math.round(width * 0.8);
  }

  throw new Error('compression_failed');
}

/**
 * Uploads an already-prepared local file to the correct bucket under
 * the {query_id}/{attachment_id}.{ext} path convention that the
 * storage RLS policies rely on (005_storage_policies.sql,
 * 017_teacher_verification_documents.sql), then records the
 * matching row in query_attachments. The server-side trigger
 * (007) will reject this insert if the file is still over the
 * per-file or per-query limit, so callers should surface that
 * error to the user rather than assume success.
 */
export async function uploadQueryAttachment(params: {
  queryId: string;
  kind: AttachmentKind;
  localUri: string;
  sizeBytes: number;
  ownerRole: 'student' | 'teacher';
  extension: string;
  durationSeconds?: number;
}) {
  const { queryId, kind, localUri, sizeBytes, ownerRole, extension, durationSeconds } = params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');

  const attachmentId = crypto.randomUUID();
  const path = `${queryId}/${attachmentId}.${extension}`;
  const bucket = BUCKET_BY_KIND[kind];

  const response = await fetch(localUri);
  const fileBody = await response.blob();

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, fileBody, {
    contentType: kind === 'image' ? 'image/jpeg' : kind === 'voice' ? 'audio/m4a' : 'application/pdf',
    upsert: false,
  });

  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from('query_attachments').insert({
    id: attachmentId,
    query_id: queryId,
    uploaded_by: user.id,
    owner_role: ownerRole,
    kind,
    storage_path: path,
    size_bytes: sizeBytes,
    duration_seconds: durationSeconds ?? null,
  });

  if (insertError) {
    // Roll back the orphaned storage object rather than leaving a
    // file with no matching database row (which would be invisible
    // to the UI but still counted against the storage quota).
    await supabase.storage.from(bucket).remove([path]);
    throw insertError;
  }

  return { attachmentId, path };
}

/**
 * Private buckets (all of ours are) require a signed URL for
 * playback/viewing — a plain public URL would 404. Kept short-lived
 * (default 1 hour) since these are generated on demand each time a
 * voice note or image is actually opened, not cached long-term.
 */
export async function getSignedAttachmentUrl(
  bucket: string,
  path: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw error ?? new Error('signed_url_failed');
  return data.signedUrl;
}
