/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    optimizePackageImports: ["three"],
    esmExternals: "loose",
  },
  webpack: (config, { isServer }) => {
    const ext = config.externals;
    let nextExternals = [
      ...(Array.isArray(ext) ? ext : ext != null ? [ext] : []),
      { canvas: "canvas" },
    ];
    if (isServer) {
      nextExternals = [
        ...nextExternals,
        "three",
        "@react-three/fiber",
        "@react-three/drei",
      ];
    }
    config.externals = nextExternals;
    return config;
  },
  async headers() {
    // Content-Security-Policy: allow self, Supabase, Stripe; block framing and restrict sources
    const cspParts = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.stripe.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' https://fonts.gstatic.com data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.stripe.com",
      "object-src 'none'",
    ];
    // Only on Vercel: avoid upgrade-insecure-requests for local `next start` (breaks http://localhost).
    if (process.env.VERCEL === "1") {
      cspParts.push("upgrade-insecure-requests");
    }
    const csp = cspParts.join("; ");

    return [
      {
        source: "/models/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=31536000" },
        ],
      },
      // API routes: full security headers including nosniff (JSON only)
      {
        source: "/api/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
      // Page/document routes only (exclude _next, static assets): omit nosniff so HTML renders if server sent wrong type
      {
        source: "/((?!api/|_next/|favicon|icon|manifest|.*\\.(?:js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2?)$).*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
