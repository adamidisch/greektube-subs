import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/audio-timing": ["./worker/fixtures/D2RjneeG_xA-source.srt"],
  },
};

export default nextConfig;
