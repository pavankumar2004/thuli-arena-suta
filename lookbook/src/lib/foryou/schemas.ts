import { z } from "zod"
import vocab from "./vocab.json"

export const COLOURS = vocab.colours as [string, ...string[]]
export const GARMENTS = vocab.garments as [string, ...string[]]
export const OCCASIONS = vocab.occasions as [string, ...string[]]

// Garments a look can be built around. Blouses come with sarees (Suta's own pairing);
// jewellery, bags and shoes aren't looks on their own.
export const ANCHORS = {
  womenswear: ["saree", "lehenga", "kurta set", "kurta", "anarkali", "dress", "co-ord set", "shirt", "top", "jacket", "skirt"],
  menswear: ["kurta", "kurta set", "shirt", "t-shirt", "jacket", "trousers", "suit", "dhoti"],
} as const
export type Wardrobe = keyof typeof ANCHORS

/** Keep only values from a vocabulary: models drift; the database doesn't. */
const within = (list: readonly string[]) =>
  z.array(z.string()).transform((xs) => xs.filter((x) => list.includes(x)))

// Stage B: one entry per photo, from the fast tagger.
export const PhotoTags = z.object({
  photos: z.array(
    z.object({
      n: z.number().int(),
      is_outfit: z.boolean(),
      worn_by_owner: z.boolean(),
      garment: z.string().transform((g) => (GARMENTS.includes(g) ? g : "other")),
      colours: within(COLOURS),
      occasion: z.string().transform((o) => (OCCASIONS.includes(o) ? o : "casual")),
      note: z.string().max(200).catch(""),
    }),
  ),
})

// Stage C: the taste profile.
export const Taste = z.object({
  wardrobe: z.enum(["womenswear", "menswear"]),
  summary: z.string().max(600),
  palette: within(COLOURS),
  garments: within(GARMENTS),
  fabrics: z.array(z.string().max(40)).max(6).catch([]),
  vibe: z.array(z.string().max(24)).max(5).catch([]),
  avoid: z.object({
    colours: within(COLOURS),
    garments: within(GARMENTS),
    notes: z.string().max(300).catch(""),
  }),
  moments: z
    .array(
      z.object({
        name: z.string().max(60),
        occasion: z.string().transform((o) => (OCCASIONS.includes(o) ? o : "casual")),
        garments: within(GARMENTS),
        colours: within(COLOURS),
        photo: z.number().int(),
        why: z.string().max(300),
      }),
    )
    .length(3),
})
export type Taste = z.infer<typeof Taste>

// Stage E: the visual pick for one moment.
export const Pick = z.object({
  choice: z.string().regex(/^c\d+$/),
  headline: z.string().max(80),
  reason: z.string().max(700),
})
