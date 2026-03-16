import type { NextConfig } from "next";

// Suppress the url.parse() deprecation warning (DEP0169) emitted by
// Node ≥ 22.  The call sites live inside Next.js / undici internals,
// not in our code, so silencing is safe until upstream ships a fix.
if (!process.env.NODE_OPTIONS?.includes("--no-deprecation")) {
  const _origEmit = process.emitWarning;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.emitWarning = function (warning: any, ...args: any[]) {
    if (typeof warning === "string" && warning.includes("url.parse()")) return;
    return _origEmit.call(process, warning, ...args);
  } as typeof process.emitWarning;
}

const nextConfig: NextConfig = {
  // Keep google-auth-library external to avoid bundling issues
  serverExternalPackages: ["google-auth-library"],
  // Ensure template files are included in serverless function bundles
  outputFileTracingIncludes: {
    "/api/extraction/load-template": [
      "./schema-test-prompt-template.txt",
      "./SCHEMA v4/**",
    ],
  },
};

export default nextConfig;
