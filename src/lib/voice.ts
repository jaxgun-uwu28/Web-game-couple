export const voiceMimeTypes = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'] as const;
export function supportedVoiceMime(supports: (mime: string) => boolean) {
  return voiceMimeTypes.find(supports) || null;
}
export function normalizePeaks(samples: number[]): number[] {
  return Array.from({ length: 64 }, (_, i) => {
    const from = Math.floor(i * samples.length / 64), to = Math.max(from + 1, Math.ceil((i + 1) * samples.length / 64));
    return Math.min(1, Math.max(0, ...samples.slice(from, to).filter(Number.isFinite)));
  });
}
export type VoiceMessage = { id: string; couple_id: string; sender_id: string; storage_path: string; mime: string; duration_ms: number; peaks: number[]; label: string; color: string; sticker: string; created_at: string; delivered_at: string | null; listened_at: string | null; favorite_by: string[]; reactions: Record<string, string> };
export type VoiceSend = { id: string; user: string; couple: string; blob: Blob; mime: string; duration: number; peaks: number[]; label: string; color: string; sticker: string };
