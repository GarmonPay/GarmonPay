import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { emptyLedger, type LedgerState } from "./types";

const FILE = path.join(process.cwd(), "data", "member-platform-staging.json");

function writesAllowed() {
  return process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production";
}

function cache(): { state: LedgerState | null } {
  const host = globalThis as typeof globalThis & { __gpMemberLedger?: LedgerState | null };
  if (!Object.prototype.hasOwnProperty.call(host, "__gpMemberLedger")) host.__gpMemberLedger = null;
  return {
    get state() { return host.__gpMemberLedger ?? null; },
    set state(value) { host.__gpMemberLedger = value; },
  };
}

export function readLedger(): LedgerState {
  const slot = cache();
  if (slot.state) return slot.state;
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as LedgerState;
    if (!parsed || !Array.isArray(parsed.members)) throw new Error("Member staging file is unreadable.");
    slot.state = parsed;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const empty = emptyLedger();
      slot.state = empty;
      return empty;
    }
    throw error;
  }
}

export function mutateLedger<T>(change: (state: LedgerState) => { state: LedgerState; result: T }): T {
  if (!writesAllowed()) throw new Error("Member workspace changes are disabled in production. Nothing was saved.");
  const { state, result } = change(structuredClone(readLedger()));
  mkdirSync(path.dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(state));
  cache().state = state;
  return result;
}
