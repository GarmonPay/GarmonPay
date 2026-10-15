import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
export function workerHeaders(body: string, key: string, now = Date.now()) {
  if (key.length < 43) throw new Error("Mint worker authentication is not configured");
  const timestamp = String(now), nonce = randomBytes(24).toString("hex");
  const signature = createHmac("sha256", key).update(`${timestamp}.${nonce}.${body}`).digest("hex");
  return { "content-type": "application/json", "x-gp-time": timestamp, "x-gp-nonce": nonce, "x-gp-auth": signature };
}
export function verifyWorkerRequest(body: string, headers: Headers, key: string, seen: Map<string, number>, now = Date.now()) {
  const time = headers.get("x-gp-time") || "", nonce = headers.get("x-gp-nonce") || "", mac = headers.get("x-gp-auth") || "";
  if (key.length < 43 || !/^\d{13}$/.test(time) || Math.abs(now - Number(time)) > 30000 || !/^[a-f0-9]{48}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(mac)) return false;
  for (const [id, expiry] of seen) if (expiry < now) seen.delete(id);
  if (seen.has(nonce) || seen.size >= 10000) return false;
  const expected = createHmac("sha256", key).update(`${time}.${nonce}.${body}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(mac, "hex"))) return false;
  seen.set(nonce, now + 60000); return true;
}
