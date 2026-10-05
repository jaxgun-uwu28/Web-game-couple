import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/ai": ["./fixtures/gemini/*.json"],
    "/api/game": ["./fixtures/gemini/*.json"],
  },
};
export default config;
