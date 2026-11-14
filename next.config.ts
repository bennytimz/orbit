import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ORBIT is an authenticated, per-user application: nearly every route reads the
  // session. We use the request-time rendering model instead of Cache Components.
  // See TECHNICAL_DECISIONS.md (TD-003).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["linkedom"],
};

export default nextConfig;
