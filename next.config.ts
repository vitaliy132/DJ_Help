import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverActions: {
    bodySizeLimit: "80mb",
  },
};

export default nextConfig;
