"use client"

import { ChapterMenu } from "@/components/navigation/chapter-menu"
import { CuratedTray } from "./curated-tray"
import { LookSheet } from "./look-sheet"
import { ProductDialog } from "./product-dialog"

export function Overlays() {
  return (
    <>
      <LookSheet />
      <ProductDialog />
      <CuratedTray />
      <ChapterMenu />
    </>
  )
}
