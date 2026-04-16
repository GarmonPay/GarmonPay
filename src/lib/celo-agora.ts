/**
 * Agora channel name for a C-Lo table — derived from `roomId` (UUID without dashes fits Agora naming rules).
 * Must match server `celoAgoraChannelName` in /api/agora/rtc-token.
 */
export function celoAgoraChannelName(roomId: string): string {
  const raw = roomId.replace(/-/g, "");
  return raw.length > 64 ? raw.slice(0, 64) : raw;
}
