// The stylist's vocabulary, mapped onto the exact values in the Neon `products` table
// (category, colours[], attributes.fabric/style/length/pattern, tags[], sizes_in_stock[]).
// Shared by the server (parsing, SQL) and the client (occasion chips).

export const OCCASIONS = {
  festive: { phrase: "festive wear", label: "Festive edit", styles: ["Festive Wear"], tags: ["festive", "diwali", "puja", "pujo", "durga puja"] },
  sangeet: { phrase: "a sangeet", label: "Sangeet", styles: ["Party Wear", "Evening Wear"], tags: ["sangeet", "mehendi", "cocktail party"] },
  wedding: { phrase: "a wedding", label: "Wedding", styles: ["Wedding Wear"], tags: ["wedding", "suta_weddings", "wedding saree"] },
  haldi: { phrase: "a haldi", label: "Haldi", styles: [], tags: ["haldi"] },
  workwear: { phrase: "workwear", label: "Workwear", styles: ["Office Wear"], tags: ["office wear", "office blouse", "casual office"] },
  casual: { phrase: "casual wear", label: "Casual", styles: ["Casual Wear", "Comfort Wear"], tags: [] },
  evening: { phrase: "an evening out", label: "Evening", styles: ["Evening Wear", "Party Wear"], tags: ["party", "cocktail party", "corporate party"] },
  summer: { phrase: "summer", label: "Summer", styles: ["Summer Wear"], tags: [] },
} as const
export type Occasion = keyof typeof OCCASIONS
export const OCCASION_KEYS = Object.keys(OCCASIONS) as Occasion[]

/** Phrases → occasion. Checked longest first. */
export const OCCASION_WORDS: [RegExp, Occasion][] = [
  [/\bsangeet|mehen?di|cocktail\b/, "sangeet"],
  [/\bhaldi\b/, "haldi"],
  [/\bwedding|shaadi|reception|bridal|bridesmaid|engagement\b/, "wedding"],
  [/\bfestive|festival|diwali|deepavali|puja|pujo|navratri|durga|eid|karwa|onam|pongal|rakhi\b/, "festive"],
  [/\boffice|work ?wear|workplace|meeting|presentation|corporate|formal\b/, "workwear"],
  [/\bcasual|everyday|daily|brunch|college|weekend\b/, "casual"],
  [/\bparty|evening|dinner|date night|night out\b/, "evening"],
  [/\bsummer|beach|vacation|holiday\b/, "summer"],
]

/** Our category names in Neon, grouped under what shoppers say. */
export const CATEGORY_WORDS: [RegExp, string[]][] = [
  [/\bsarees?|saris?\b/, ["Sarees"]],
  [/\bblouses?\b/, ["Blouses", "Garage Blouses", "T-Shirt Blouses"]],
  [/\bkurtas?|kurtis?|co-?ords?|kurta sets?\b/, ["Co-ords & Kurta Sets", "Kurtas"]],
  [/\bdress(es)?|gowns?\b/, ["Dresses"]],
  [/\blehengas?|lehangas?|skirts?|ghagras?\b/, ["Lehengas", "Skirts"]],
  [/\bdupattas?|stoles?|shawls?\b/, ["Dupattas", "Stoles & Shawls"]],
  [/\bshirts?\b/, ["Shirts"]],
  [/\bjackets?|shrugs?\b/, ["Jackets"]],
  [/\btrousers?|pants|palazzos?|shorts\b/, ["Trousers", "Shorts & Trousers"]],
  [/\bjewell?e?ry|earrings?|jhumkas?|necklaces?|chokers?|bangles?\b/, ["Jewellery"]],
  [/\bbags?|totes?|potli\b/, ["Bags"]],
  [/\bshoes?|footwear|juttis?|flats|sandals?\b/, ["Shoes"]],
  [/\bpetticoats?|underskirts?|shapewear\b/, ["Petticoats"]],
  [/\bfabrics?|by the metre|yardage\b/, ["Fabric"]],
  [/\blounge ?wear|night ?wear|pyjamas?\b/, ["Loungewear"]],
]

/** "Outfit", "something to wear": whole looks, not blouses or accessories on their own. */
export const OUTFIT_CATEGORIES = ["Sarees", "Co-ords & Kurta Sets", "Dresses", "Lehengas"]
export const OUTFIT_WORDS = /\boutfits?|looks?|something to wear|what (should|can) i wear|wear to|ensemble|attire\b/

/** Things Suta does not make. Only refused when no catalogue category is also named. */
export const OUT_OF_SCOPE =
  /\bsneakers?|trainers|running shoes|sports? shoes|heels|stilettos|boots|jeans|denim|hoodies?|sweat ?shirts?|tracksuits?|blazers?|tuxedos?|suits?\b(?! for)|leather|watch(es)?|perfumes?|fragrance|make ?up|lipsticks?|cosmetics|sunglasses|spectacles|belts?|wallets?|phones?|laptops?|electronics|swim ?wear|bikinis?|lingerie|bras?|gym ?wear|sports ?wear|socks|caps?|hats?|furniture|groceries|food\b/

export const COLOUR_WORDS: [RegExp, string[]][] = [
  [/\bred|crimson|scarlet|laal|lal\b/, ["Red"]],
  [/\bmaroon|burgundy|wine|oxblood\b/, ["Maroon", "Wine"]],
  [/\bpink|rose|blush|gulabi|rani\b/, ["Pink"]],
  [/\bmagenta|fuchsia\b/, ["Magenta", "Pink"]],
  [/\bnavy\b/, ["Navy", "Navy Blue", "Blue"]],
  [/\bblue|indigo|neel|sky\b/, ["Blue", "Navy", "Navy Blue"]],
  [/\bteal|turquoise|peacock|firozi\b/, ["Teal"]],
  [/\b(sage|mint|olive|bottle|emerald|forest)?\s*green|hara\b/, ["Green", "Olive", "Mint"]],
  [/\byellow|haldi|lemon\b/, ["Yellow"]],
  [/\bmustard|ochre\b/, ["Mustard", "Yellow"]],
  [/\borange|saffron|kesariya\b/, ["Orange"]],
  [/\brust|terracotta|copper\b/, ["Rust", "Orange"]],
  [/\bpeach|coral\b/, ["Peach", "Coral"]],
  [/\bpurple|violet|plum|jamuni|baingani\b/, ["Purple"]],
  [/\blavender|lilac|mauve\b/, ["Lavender", "Mauve", "Purple"]],
  [/\bblack|kaala|kala\b/, ["Black"]],
  [/\bgr[ae]y|charcoal|slate\b/, ["Grey"]],
  [/\boff[- ]?white|ivory|cream|ecru|kora\b/, ["Off White", "Ivory", "Cream", "White"]],
  [/\bwhite|safed\b/, ["White", "Off White"]],
  [/\bbeige|nude|sand|camel\b/, ["Beige"]],
  [/\bbrown|chocolate|coffee|tan\b/, ["Brown"]],
  [/\bgold(en)?|sona\b/, ["Gold"]],
  [/\bsilver\b/, ["Silver"]],
  [/\bmulti ?colou?r(ed)?|rainbow\b/, ["Multicolour"]],
]

/** Fabric words → ILIKE patterns against attributes.fabric (so "silk" also finds Tussar Silk). */
export const FABRIC_WORDS: [RegExp, string[]][] = [
  [/\bmul ?mul|mul\b|muslin\b/, ["mul", "muslin"]],
  [/\blinen\b/, ["linen"]],
  [/\btussar\b/, ["tussar"]],
  [/\btissue\b/, ["tissue"]],
  [/\bchanderi\b/, ["chanderi"]],
  [/\borganza\b/, ["organza"]],
  [/\bgeorgette\b/, ["georgette"]],
  [/\bvelvet\b/, ["velvet"]],
  [/\bsilk|silken|resham\b/, ["silk"]],
  [/\bkhadi|handloom cotton|cotton\b/, ["cotton"]],
  [/\bmodal|viscose|rayon\b/, ["modal", "viscose", "rayon"]],
  [/\bwool(len)?|pashmina\b/, ["wool", "pashmina"]],
]

/** Weaves, techniques and patterns: matched in attributes.type / pattern / technique and tags. */
export const CRAFT_WORDS: [RegExp, string][] = [
  [/\bjamdani\b/, "Jamdani"],
  [/\bbanarasi\b/, "Banarasi"],
  [/\bikk?at\b/, "Ikat"],
  [/\bajrakh\b/, "Ajrakh"],
  [/\bbandhani|bandhej\b/, "Bandhani"],
  [/\bkantha\b/, "Kantha"],
  [/\bblock[- ]?print(ed)?\b/, "Block Print"],
  [/\bhand[- ]?painted\b/, "Hand Painted"],
  [/\bembroider(ed|y)\b/, "Embroidery"],
  [/\bzari\b/, "Zari"],
  [/\bsequin(s|ned)?|chumki\b/, "Sequin"],
  [/\bfloral|flowers?\b/, "Floral"],
  [/\bstripes?|striped\b/, "Stripes"],
  [/\bchecks?|checked|gingham\b/, "Checks"],
  [/\bpolka\b/, "Polka Dot"],
  [/\bplain|solid|minimal\b/, "Plain"],
  [/\bhandwoven|handloom\b/, "Handwoven"],
  [/\bbrocade\b/, "Brocade"],
  [/\bruffles?\b/, "Ruffles"],
  [/\bpre[- ]?draped?|ready[- ]?to[- ]?wear\b/, "Pre Drape Saree"],
]

export const LENGTH_WORDS: [RegExp, string[]][] = [
  [/\babove (the )?knee|short\b/, ["Above Knee"]],
  [/\bknee[- ]length|knee\b/, ["Knee Length", "Below Knee Length"]],
  [/\bmidi|below (the )?knee|calf\b/, ["Below Knee Length"]],
  [/\bfull[- ]length|maxi|ankle|floor\b/, ["Full Length"]],
]

export const SIZE_RE = /\b(?:in|size|sized?|an?)\s+(xxs|xs|s|m|l|xl|xxl|2xl|3xl|4xl|5xl|6xl|small|medium|large|extra large)\b/i
export const SIZE_ALIASES: Record<string, string> = {
  small: "S",
  medium: "M",
  large: "L",
  "extra large": "XL",
  "2xl": "XXL",
}

/** Vague "feel" words → soft preferences (ranked, not filtered). */
export const VIBES: [RegExp, { fabrics?: string[]; crafts?: string[]; minPrice?: number }][] = [
  [/\bexpensive|luxur|rich|regal|grand|opulent|heirloom|statement\b/, { fabrics: ["silk", "tissue", "tussar"], crafts: ["Zari", "Handwoven", "Banarasi", "Jamdani"], minPrice: 4000 }],
  [/\bcomfort|breathable|easy|light(weight)?|airy|soft|humid|hot\b/, { fabrics: ["mul", "cotton", "linen"] }],
  [/\bminimal|understated|subtle|quiet|elegant\b/, { crafts: ["Plain", "Handwoven"] }],
  [/\bbold|loud|bright|fun|quirky\b/, { crafts: ["Colour Block", "Stripes"] }],
]
