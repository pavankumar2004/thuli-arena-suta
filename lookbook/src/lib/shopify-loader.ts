// next/image loader for cdn.shopify.com: the CDN resizes on `width` and negotiates
// WebP/AVIF from the Accept header, so the static export needs no image server.
// Our own generated photographs (public/images/looks/*.jpg) have WebP copies at these
// widths, written by scripts/build-data.mjs.
const LOCAL_WIDTHS = [640, 1080, 1600]

export default function shopifyLoader({ src, width }: { src: string; width: number }) {
  if (src.startsWith("/images/looks/")) {
    const w = LOCAL_WIDTHS.find((x) => x >= width) ?? LOCAL_WIDTHS.at(-1)
    return src.replace(/\.\w+$/, `-${w}.webp`)
  }
  if (!src.includes("cdn.shopify.com")) return src
  const url = new URL(src)
  url.searchParams.set("width", String(width))
  return url.toString()
}

export function shopifyImage(src: string, width: number) {
  return shopifyLoader({ src, width })
}
