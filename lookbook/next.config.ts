import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Plain static files, served by Cloudflare Pages.
  output: "export",
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
