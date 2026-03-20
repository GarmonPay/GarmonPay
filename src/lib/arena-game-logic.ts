/**
 * Arena **game logic** is intentionally separate from Meshy / Three.js visuals.
 *
 * - Damage, stamina resolution, rounds, knockout, AI picks, matchmaking: `server/fight-server.js`
 * - REST + Socket.IO: `src/app/api/arena/fights/**`, `server/fight-server.js`
 *
 * UI components should only **display** state from the server; they must not re-implement combat rules.
 */
export const ARENA_GAME_LOGIC_SOURCE = "server/fight-server.js" as const;
