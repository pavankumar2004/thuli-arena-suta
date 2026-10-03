import type { Metadata, Viewport } from "next"
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google"
import { Providers } from "@/components/providers"
import "./globals.css"

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  display: "swap",
})

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "Utsav · A festive almanac by Suta",
  description:
    "Six chapters of a festive season, from Durga Puja to the quiet after Diwali, told through Suta's handwoven sarees. Every piece is real and shoppable.",
  openGraph: {
    title: "Utsav · A festive almanac by Suta",
    description: "Six chapters, twenty-four looks, one festive season in handloom.",
    type: "website",
  },
}

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${cormorant.variable} ${jakarta.variable} antialiased`}>
      <head>
        <link rel="preconnect" href="https://cdn.shopify.com" crossOrigin="" />
      </head>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
