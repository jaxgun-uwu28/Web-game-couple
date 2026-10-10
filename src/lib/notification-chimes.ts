export const notificationChimes = [
  { id: "sweet_bell", label: "Sweet Bell", notes: [784, 1047, 1319] },
  { id: "little_sparkle", label: "Little Sparkle", notes: [1047, 1319, 1568, 2093] },
  { id: "soft_hearts", label: "Soft Hearts", notes: [523, 659, 784] },
] as const;
export function notificationChime(value: unknown) {
  return notificationChimes.find(chime => chime.id === value) || notificationChimes[0];
}
export function previewNotificationChime(value: unknown) {
  const audio = new Audio(`/audio/notifications/${notificationChime(value).id}.wav`);
  return audio.play();
}
