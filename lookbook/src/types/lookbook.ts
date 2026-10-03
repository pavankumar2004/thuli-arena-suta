/** What the page needs to show a piece (src/data/products.index.json). */
export interface ProductSummary {
  handle: string
  title: string
  url: string
  category: string | null
  price: number
  compareAtPrice: number | null
  available: boolean
  fabric: string | null
  collection: string | null
  /** Only the photographs the page itself shows. */
  images: string[]
}

/** Everything the drawers show (src/data/products.json), loaded with them. */
export interface Product extends ProductSummary {
  currency: string
  sizes: string[]
  sizesInStock: string[]
  colours: string[]
  technique: string[]
  length: string | null
  blousePiece: string | null
  /** Suta's own pre-order note, e.g. "shipped within 7 days". */
  preOrder: string | null
  story: string
  description: string
}

export interface ImageRef {
  product: string
  index: number
  /** A generated lookbook photograph in public/ that shows `product`; replaces its catalogue photo. */
  src?: string
}

/** A pin on a look's photograph, in percent of the image's width and height. */
export interface Hotspot {
  product: string
  x: number
  y: number
}

export interface Look {
  id: string
  title: string
  image: ImageRef
  blurb: string
  hotspots: Hotspot[]
  /** Pieces worn in the photo that are not visible enough to pin. */
  extras?: string[]
}

export interface Chapter {
  id: string
  numeral: string
  name: string
  title: string
  when: string
  verse: string
  intro: string
  drape: string
  tone: "light" | "dark"
  palette: string[]
  /** Banner that opens the chapter: ticker colour, and vertical focus (%) of each frame. */
  banner?: { ink?: string; focus?: number[] }
  /** Extra frames from the shoot, for the chapter's banner and filmstrip. */
  frames: ImageRef[]
  looks: Look[]
}

export interface Lookbook {
  title: string
  subtitle: string
  season: string
  statement: string
  /** Three panels (one on phones), each cycling through its slides. */
  cover: (ImageRef & { x: number; y: number })[][]
  prologue: string[]
  chapters: Chapter[]
}

/** A photograph resolved to its URL by scripts/build-data.mjs. */
export interface Frame {
  src: string
  product: string
}

/** A look with its position in the book, for numbering and navigation. */
export interface IndexedLook extends Look {
  number: number
  chapter: Chapter
}
