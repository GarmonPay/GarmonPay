/**
 * Cookie options for production: Secure, SameSite.
 * Use when setting cookies in API routes or server components.
 * Session/admin session currently use localStorage; use this when adding cookie-based auth.
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
