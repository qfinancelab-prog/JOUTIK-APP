import { Audio } from 'expo-av';

// Preserving original audio is a product requirement (no
// transcription, no lossy re-encoding beyond what the device's own
// recorder does). HIGH_QUALITY on expo-av already produces a
// reasonably compact AAC/.m4a file on both iOS and Android — no
// additional compression pass is applied here, unlike images, since
// voice at this bitrate is already close to the platform limit
// (max_voice_bytes = 1.5MB, ~90 seconds) without further processing.
let activeRecording: Audio.Recording | null = null;

export async function startRecording(): Promise<void> {
  const permission = await Audio.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('microphone_permission_denied');
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await recording.startAsync();
  activeRecording = recording;
}

export async function stopRecording(): Promise<{ uri: string; durationMillis: number; sizeBytes: number }> {
  if (!activeRecording) throw new Error('no_active_recording');

  await activeRecording.stopAndUnloadAsync();
  const uri = activeRecording.getURI();
  const status = await activeRecording.getStatusAsync();
  activeRecording = null;

  if (!uri) throw new Error('recording_failed');

  const response = await fetch(uri);
  const blob = await response.blob();

  return {
    uri,
    durationMillis: status.durationMillis ?? 0,
    sizeBytes: blob.size,
  };
}

export async function cancelRecording(): Promise<void> {
  if (!activeRecording) return;
  try {
    await activeRecording.stopAndUnloadAsync();
  } catch {
    // already stopped/unloaded — nothing to clean up
  }
  activeRecording = null;
}
