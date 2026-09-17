import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  serverExternalPackages: ["better-sqlite3"],
  // NOTE: in Next 16 the key is only valid under `experimental` – a top-level
  // `serverActions` is not read and fails the production type check
  // (TS2353: 'serverActions' does not exist in type 'NextConfig').
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};
export default config;
