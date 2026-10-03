"use client"

import { lookbook } from "@/lib/lookbook"
import { scrollToId } from "@/lib/scroll"
import { useOverlays } from "@/store/lookbook"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"

/** The chapter list on phones and tablets. */
export function ChapterMenu() {
  const open = useOverlays((s) => s.menu)
  const setMenu = useOverlays((s) => s.setMenu)

  const go = (id: string) => {
    setMenu(false)
    // let the sheet release the page before scrolling it
    window.setTimeout(() => scrollToId(id), 320)
  }

  return (
    <Sheet open={open} onOpenChange={setMenu}>
      <SheetContent side="right" className="w-full border-none bg-ink p-0 text-ecru sm:max-w-md" data-lenis-prevent>
        <div className="flex h-full flex-col overflow-y-auto px-8 pt-20 pb-10">
          <SheetTitle className="eyebrow font-normal text-ecru/60">The almanac</SheetTitle>
          <SheetDescription className="sr-only">Jump to a chapter</SheetDescription>
          <ol className="mt-8 space-y-6">
            {lookbook.chapters.map((c) => (
              <li key={c.id}>
                <button onClick={() => go(c.id)} className="group flex w-full items-baseline gap-4 text-left">
                  <span className="w-8 font-display text-xl text-haldi italic">{c.numeral}</span>
                  <span>
                    <span className="block font-display text-4xl leading-none font-light">{c.name}</span>
                    <span className="mt-1 block text-sm text-ecru/60">{c.title}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <button onClick={() => go("index")} className="eyebrow mt-auto self-start border-b border-ecru/40 pt-10 pb-1">
            All twenty-four looks
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
