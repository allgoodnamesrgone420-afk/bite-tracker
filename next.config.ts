import type { NextConfig } from "next";

// Next's dev server evaluates code for hot reloading; production builds don't need eval.
const isDev = process.env.NODE_ENV !== "production";

/** The Supabase project this build talks to (accounts and sync), if any. */
function supabaseSources(): string {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
    return host ? ` https://${host} wss://${host}` : "";
  } catch {
    return "";
  }
}

// Limits what the page may load and where it may send data, so an injected
// script (or a compromised dependency) can't ship food logs or the session
// token to another server. 'wasm-unsafe-eval' is for the barcode decoder.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self'${supabaseSources()}${isDev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Content-Security-Policy", value: csp },
          // Camera: photo logging and barcode scanning. Microphone: voice logging. Nothing else.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
