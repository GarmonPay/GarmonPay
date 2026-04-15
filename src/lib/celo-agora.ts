/** Must match server `celoAgoraChannelName` in /api/agora/rtc-token. */
export function celoAgoraChannelName(roomId: string): string {
  const raw = `celo_${roomId.replace(/-/g, "")}`;
  return raw.length > 64 ? raw.slice(0, 64) : raw;
}
