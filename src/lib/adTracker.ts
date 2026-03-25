/**
 * Shared constants for ad engagement timing. Fraud checks run server-side
 * in `/api/ads/engage` (IP, velocity, bot timing, VPN heuristics).
 */
export const MIN_VIDEO_WATCH_SECONDS_DEFAULT = 5;

/** Minimum seconds before a banner engagement may be submitted (client hint). */
export const MIN_BANNER_DWELL_MS = 800;
