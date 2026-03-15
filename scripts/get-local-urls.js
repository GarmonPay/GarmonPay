#!/usr/bin/env node
/**
 * Get local and network URLs for dev server.
 * Used by dev script to print access URLs (localhost + network IP).
 */
const os = require("os");

function getLocalNetworkIP() {
  try {
    const ifaces = os.networkInterfaces();
    if (!ifaces) return null;
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (iface.family === "IPv4" && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch (e) {
    // Sandbox or permission may block networkInterfaces()
  }
  return null;
}

const port = process.env.PORT || 3000;
const networkIP = getLocalNetworkIP();

console.log("");
console.log("  \x1b[1mGarmonPay dev server\x1b[0m");
console.log("  —————————————————————");
console.log("  Local:   \x1b[36mhttp://localhost:" + port + "\x1b[0m");
if (networkIP) {
  const networkUrl = "http://" + networkIP + ":" + port;
  console.log("  Network: \x1b[32m" + networkUrl + "\x1b[0m");
  console.log("");
  console.log("  \x1b[33mUse the Network URL on your phone / other devices\x1b[0m");
  console.log("  \x1b[33m(e.g. iPhone Safari). Same Wi‑Fi required.\x1b[0m");
  console.log("");
  console.log("  \x1b[33mAuth links in emails (reset, verify) use your site URL (e.g. https://garmonpay.com).\x1b[0m");
} else {
  console.log("  Network: (no external interface found)");
  console.log("");
}
console.log("  —————————————————————");
console.log("");
