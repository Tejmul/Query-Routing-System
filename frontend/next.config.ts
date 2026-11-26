import type { NextConfig } from "next";

// The FastAPI backend (make serve). Every API call goes through this proxy, so the browser only
// ever talks to the Next.js app and no CORS setup is needed.
const API = process.env.BANKQ_API_URL ?? "http://127.0.0.1:8077";

const nextConfig: NextConfig = {
  // Dev only: allow opening the app at http://127.0.0.1:3000 as well as localhost (live reload included).
  allowedDevOrigins: ["127.0.0.1"],
  // No floating Next.js dev badge: it would sit on top of the app during demos.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return ["/api/:path*", "/health", "/ready", "/metrics", "/docs", "/openapi.json"].map((source) => ({
      source,
      destination: `${API}${source}`,
    }));
  },
};

export default nextConfig;
