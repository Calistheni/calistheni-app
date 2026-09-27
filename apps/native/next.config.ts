import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  turbopack: {
    // This app reuses the repository's dependency installation and will later
    // consume explicitly audited client-safe shared modules from this root.
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
