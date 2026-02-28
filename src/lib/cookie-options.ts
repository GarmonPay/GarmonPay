/**
 * Cookie options for production: Secure, SameSite.
 * Use when setting cookies in API routes or server components.
 * Admin session uses Supabase auth only (no localStorage).
 */

export function getSecureCookieOptions(): {
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  httpOnly?: boolean;
  path: string;
  maxAge?: number;
} {
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production";

  return {
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    path: "/",
  };
}
