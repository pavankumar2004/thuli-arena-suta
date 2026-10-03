import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // A Node server (Vercel, or `next start`): the stylist (Task 4) and "Made for you" (Task 3)
  // need API routes. The lookbook pages themselves are still pre-rendered at build time.
  images: {
    // Product photos stay on Shopify's CDN, which resizes and serves WebP/AVIF itself.
    loader: "custom",
    loaderFile: "./src/lib/shopify-loader.ts",
    // Fewer candidate widths keeps each srcset (and so the HTML) small.
    deviceSizes: [420, 520, 640, 828, 1080, 1440, 1920],
    imageSizes: [64, 96, 160, 256],
  },
};

export default nextConfig;
