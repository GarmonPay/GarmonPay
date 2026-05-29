import { computePvpCoinFlipSettlement } from "@/lib/coin-flip";

export const GARMONFOUR_MIN_ENTRY_GPC = 100;

export type ConnectFourBoard = number[][];

/** Fallback when DB JSON is briefly invalid — keeps the grid on-screen. */
export function createEmptyConnectFourBoard(): ConnectFourBoard {
  return Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => 0));
}

/** Settlement preview: same 10% of total pot as Coin Flip PvP. */
export function computeGarmonFourSettlement(entryPerPlayerGpc: number) {
  return computePvpCoinFlipSettlement(entryPerPlayerGpc);
}

export function parseConnectFourBoard(raw: unknown): ConnectFourBoard | null {
  if (!Array.isArray(raw) || raw.length !== 6) return null;
  const out: ConnectFourBoard = [];
  for (let r = 0; r < 6; r++) {
    const row = raw[r];
    if (!Array.isArray(row) || row.length !== 7) return null;
    const nums = row.map((c) => {
      const n = typeof c === "number" ? c : Number(c);
      return Number.isFinite(n) ? Math.trunc(n) : 0;
    });
    out.push(nums);
  }
  return out;
}

export function findLastPlacedCell(
  prev: ConnectFourBoard | null,
  next: ConnectFourBoard
): { r: number; c: number; v: number } | null {
  if (!prev) return null;
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      if (prev[r][c] !== next[r][c]) {
        return { r, c, v: next[r][c] };
      }
    }
  }
  return null;
}

const DIRS: readonly [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** Returns four cells forming a winning line through (r,c) for piece value v, or null. */
export function findWinningLine(
  board: ConnectFourBoard,
  r: number,
  c: number,
  v: number
): [number, number][] | null {
  if (v !== 1 && v !== 2) return null;
  for (const [dr, dc] of DIRS) {
    const cells: [number, number][] = [[r, c]];
    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && board[rr][cc] === v) {
      cells.push([rr, cc]);
      rr += dr;
      cc += dc;
    }
    rr = r - dr;
    cc = c - dc;
    while (rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && board[rr][cc] === v) {
      cells.unshift([rr, cc]);
      rr -= dr;
      cc -= dc;
    }
    if (cells.length >= 4) {
      return cells.slice(0, 4);
    }
  }
  return null;
}

export function boardHasConnectFour(board: ConnectFourBoard, piece: 1 | 2): boolean {
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      if (board[r][c] === piece && findWinningLine(board, r, c, piece)) {
        return true;
      }
    }
  }
  return false;
}

export function findBoardWinningLine(
  board: ConnectFourBoard,
  piece: 1 | 2
): [number, number][] | null {
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      if (board[r][c] === piece) {
        const line = findWinningLine(board, r, c, piece);
        if (line) return line;
      }
    }
  }
  return null;
}

/** Which side connected four, if any (1 = heads / creator, 2 = tails / guest). */
export function detectBoardWinner(board: ConnectFourBoard): 1 | 2 | null {
  if (boardHasConnectFour(board, 1)) return 1;
  if (boardHasConnectFour(board, 2)) return 2;
  return null;
}

export function isConnectFourBoardFull(board: ConnectFourBoard): boolean {
  for (let c = 0; c < 7; c++) {
    if (board[0][c] === 0) return false;
  }
  return true;
}
