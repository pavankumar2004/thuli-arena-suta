import { ArrowUpRight } from "lucide-react"
import { Logo } from "@/components/brand/logo"

export function Colophon() {
  return (
    <footer className="grain bg-ecru px-4 pt-24 pb-12 sm:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="grid gap-16 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Logo className="h-24 text-charcoal sm:h-32" />
            <p className="display mt-8 text-[clamp(2.5rem,6vw,4.5rem)] italic">Su + Ta</p>
            <p className="mt-6 max-w-lg text-[0.98rem] leading-relaxed text-charcoal/75">
              Suta began with two sisters, Sujata and Taniya, and a belief that a saree should feel like
              something you live in. They work with weavers and artisans across India, and every piece in this almanac is
              from their catalogue at suta.in.
            </p>
            <a
              href="https://suta.in"
              target="_blank"
              rel="noopener"
              className="mt-10 inline-flex items-center gap-2 bg-charcoal px-6 py-3.5 text-sm text-ecru transition-colors hover:bg-rust"
            >
              Visit suta.in <ArrowUpRight className="size-4" strokeWidth={1.5} />
            </a>
          </div>
          <dl className="grid grid-cols-2 gap-8 self-end text-sm lg:col-span-5">
            <div>
              <dt className="eyebrow text-stone">Photographs &amp; pieces</dt>
              <dd className="mt-3 leading-relaxed">Suta, from suta.in&rsquo;s public catalogue</dd>
            </div>
            <div>
              <dt className="eyebrow text-stone">Season</dt>
              <dd className="mt-3 leading-relaxed">Festive, Autumn 2026</dd>
            </div>
            <div className="col-span-2">
              <dt className="eyebrow text-stone">About this almanac</dt>
              <dd className="mt-3 leading-relaxed text-charcoal/75">
                An independent lookbook made for the Thuli Arena hackathon. Not affiliated with or endorsed by Suta.
              </dd>
            </div>
          </dl>
        </div>
        <div className="mt-20 flex flex-col justify-between gap-3 border-t border-charcoal/15 pt-6 text-xs text-stone sm:flex-row">
          <span>Utsav · A festive almanac in six chapters</span>
          <span>Woven from memory, draped in longing.</span>
        </div>
      </div>
    </footer>
  )
}
