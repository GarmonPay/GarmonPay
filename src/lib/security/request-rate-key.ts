/** Session reads are polled by the header and the members page. They must not share the sign-in write limit. */
export function requestRateLimit(pathname: string, method: string): { key: string; limit: number } | null {
  if (pathname === "/api/solana/auth/event") return null;
  if (pathname === "/api/solana/auth/session" && method === "GET") return { key: "solana-session-read", limit: 120 };
  if (pathname.startsWith("/api/solana/auth/")) return { key: "solana-auth-write", limit: 10 };
  if (pathname.startsWith("/api/solana/launches/")) return { key: "solana-metadata", limit: 10 };
  if (pathname.startsWith("/api/admin")) return { key: "admin", limit: 10 };
  if (pathname === "/api/wallet/fund" && method === "POST") return { key: "wallet-fund", limit: 10 };
  if (pathname === "/api/create-checkout-session" && method === "POST") return { key: "checkout", limit: 10 };
  if (pathname === "/api/stripe/add-funds" && method === "POST") return { key: "add-funds", limit: 10 };
  return null;
}
