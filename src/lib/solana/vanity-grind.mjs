import { parentPort, workerData } from "node:worker_threads";
import { generateKeyPairSync } from "node:crypto";

// Native OpenSSL Ed25519 generation. No browser CPU, deterministic seeds or key logs.
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const suffix = workerData.suffix;
const modulus = 58 ** suffix.length;
const deadline = Date.now() + workerData.maxMs;
let reported = 0;
for (let attempts = 0; attempts < workerData.maxAttempts && Date.now() < deadline; attempts++) {
  const pair = generateKeyPairSync("ed25519");
  const publicDer = pair.publicKey.export({ type: "spki", format: "der" });
  const publicKey = publicDer.subarray(-32);
  let mod = 0;
  for (const byte of publicKey) mod = (mod * 256 + byte) % modulus;
  let tail = "";
  for (let digit = 0; digit < suffix.length; digit++) { tail = alphabet[mod % 58] + tail; mod = Math.floor(mod / 58); }
  reported++;
  if (tail === suffix) {
    const privateDer = pair.privateKey.export({ type: "pkcs8", format: "der" });
    const secret = new Uint8Array(64);
    secret.set(privateDer.subarray(-32)); secret.set(publicKey, 32);
    privateDer.fill(0);
    parentPort.postMessage({ type: "found", publicKey, secret, attempts: reported });
    secret.fill(0);
    process.exit(0);
  }
  if (reported >= 10000) { parentPort.postMessage({ type: "progress", attempts: reported }); reported = 0; }
}
parentPort.postMessage({ type: "progress", attempts: reported });
parentPort.postMessage({ type: "done" });
