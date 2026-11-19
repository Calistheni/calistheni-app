import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // The image optimizer caches its output. Only public static paths belong here.
    localPatterns: [
      { pathname: "/icons/**", search: "" },
      { pathname: "/food-icons/**", search: "" },
      { pathname: "/_next/static/media/**", search: "" },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.openfoodfacts.org",
      },
    ],
  },
};

export default nextConfig;
