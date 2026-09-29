import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Creates a small self-contained build, used by our Docker image (Vercel ignores this safely)
  output: "standalone",
};

export default nextConfig;
