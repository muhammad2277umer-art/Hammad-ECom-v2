import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Old links from before brands became one of three vendor types.
  async redirects() {
    return [
      { source: "/brands", destination: "/vendors", permanent: true },
      { source: "/brands/:path*", destination: "/vendors/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
