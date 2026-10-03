import { lookbook } from "@/lib/lookbook"
import { Header } from "@/components/navigation/header"
import { Cover } from "@/components/editorial/cover"
import { Prologue } from "@/components/editorial/prologue"
import { Chapter } from "@/components/editorial/chapter"
import { LookIndex } from "@/components/editorial/look-index"
import { Colophon } from "@/components/editorial/colophon"
import { LazyOverlays } from "@/components/product/lazy-overlays"
import { StylistLauncher } from "@/components/stylist/stylist-launcher"

export default function Home() {
  const nav = lookbook.chapters.map(({ id, numeral, name }) => ({ id, numeral, name }))
  return (
    <>
      <Header chapters={nav} />
      <main>
        <Cover />
        <Prologue />
        {lookbook.chapters.map((chapter, i) => (
          <Chapter key={chapter.id} chapter={chapter} index={i} />
        ))}
        <LookIndex />
      </main>
      <Colophon />
      <LazyOverlays />
      <StylistLauncher />
    </>
  )
}
