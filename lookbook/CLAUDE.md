@AGENTS.md

# CLAUDE.md — SUTA Interactive Digital Lookbook

## 1. Project Mission & Identity
You are building an award-winning, production-grade, interactive Digital Lookbook web application for **SUTA** (suta.in), the iconic Indian artisanal handloom brand.

### Brand Essence (SUTA)
- **Founders' Spirit:** Named after Sujata & Taniya ("Su" & "Ta" meaning thread). Slow fashion, soul-stirring, nostalgic, raw, feminine, unapologetically Indian.
- **Aesthetic Direction:** Earthy elegance, Kinfolk-meets-Indian-heritage. Muted terracottas, raw ecru, deep indigo, mustard yellow, forest greens, warm sunlight, texture-rich mulmul/linen/jamdani.
- **Tone & Voice:** Poetic, intimate, warm, evocative. Microcopy should read like verse, not generic retail banners.
- **Goal:** Deliver an immersive, high-converting, responsive lookbook deployable to a public URL (Vercel/Netlify) meeting all competition judging criteria.

---

## 2. Core Architecture & Tech Stack

- **Framework:** Next.js (App Router, React 19 / 18, TypeScript) or Vite + React (TypeScript). Default to Next.js for SSR, SEO, and seamless 1-command deployment to Vercel.
- **Styling:** Tailwind CSS + Framer Motion (for editorial page transitions, parallax drapes, smooth image unveils).
- **Typography:**
  - Serif Display (Editorial / Headings): `Cinzel`, `Playfair Display`, or `Cormorant Garamond`
  - Sans Body (Legibility / Product Info): `Plus Jakarta Sans`, `Inter`, or `Outfit`
- **Smooth Scrolling:** `@studio-freight/lenis` or Lenis scroll for luxury fashion editorial feel.
- **Icons:** `lucide-react` (minimal, elegant stroke weight: 1.5).

---

## 3. Product & Image Strategy (OpenRouter + SUTA DB)

1. **Asset Pipeline:**
   - Real product metadata & thumbnail URLs live in `/data/products.json` or `/data/looks.json`.
   - Editorial hero assets generated via OpenRouter (using SOTA models e.g., `black-forest-labs/flux-1.1-pro`, `midjourney`, or `sdxl`).
   - Run a batch generator script (`scripts/generate-looks.ts`) via OpenRouter to populate curated images with consistent aesthetics:
     - Prompt style: *"Cinematic editorial campaign for Suta Bombay, Indian woman in a breezy handwoven mulmul saree, warm sunlit vintage verandah, raw textures, soulful lighting, 35mm film grain, 8k, photorealistic --ar 4:5"*
   - Store finalized assets statically in `/public/images/looks/` to avoid live API failures or latency during judging review.

2. **Aspect Ratios & Formats:**
   - Vertical Lookbook Editorial: `4:5` (`1080x1350`) or `9:16` for mobile stories.
   - Panoramic Story Sliders: `16:9` with focal point containment.
   - Next.js `<Image>` with priority loading, blurred placeholder, and WebP format.

---

## 4. Key Interactive Lookbook Features (Judging Criteria Checklist)

1. **Editorial Hero & Mood Switcher:**
   - Filter lookbook by mood/collection: *The Monsoon Verandah*, *Mulmul Memoirs*, *Bahaar*, *Sundowner Jamdani*.
2. **Shoppable Visual Hotspots ("Shop the Look"):**
   - Interactive pulsing pins on editorial imagery revealing product card overlays with real DB data (Saree Name, Fabric, Price, "View Product" direct link).
3. **Immersive Storytelling Modal / Drawer:**
   - Clicking a look opens an editorial spread with fabric origin stories, artisan craftsmanship notes, drape recommendations, and complementary blouses/accessories.
4. **Interactive Drape & Fabric Zoom:**
   - Zoom-in preview highlighting the texture/weave of the fabric.
5. **Atmospheric Audio Toggle (Optional Delight):**
   - Subtle ambient soundscape (morning raag, soft monsoon rain, ghungroo rustle) with user-controlled play/mute toggle.
6. **Cart / Wishlist / "Save to Lookbook" Drawer:**
   - Lightweight client-side state (Zustand or React Context) allowing users to curate their personalized lookbook.

---

## 5. Development & Coding Norms

### Code Quality & Structure
- **Strict TypeScript:** No `any`. Explicit interfaces for `Product`, `Look`, `Hotspot`, `Collection`.
- **Component Organization:**
src/
├── components/
│ ├── editorial/ # LookbookCard, Hotspot, ParallaxImage, StoryDrawer
│ ├── navigation/ # Header, CollectionFilter, AudioToggle
│ ├── product/ # ProductModal, QuickShopDrawer, FabricZoom
│ └── ui/ # Buttons, Sliders, Modals, Badges
├── data/ # collections.json, products.json, looks.json
├── hooks/ # useLookbook, useLenis, useSound
├── lib/ # utils, OpenRouter client (for scripts)
└── types/ # lookbook.types.ts
code
Code
- **Performance First:**
- 100% responsive across Mobile (375px+), Tablet, and Ultrawide.
- Zero layout shift (CLS < 0.05). Provide explicit width/height or aspect-ratio boxes.
- Smooth Framer Motion variants; avoid animating expensive properties (only animate `transform` and `opacity`).

### Error Handling & Polish
- Provide fallback states if any image URL in the DB fails to load.
- Ensure all interactive elements have hover, active, and accessible ARIA attributes.

---

## 6. Deployment Protocol (Claude Code Execution)

- **Target Host:** Vercel (preferred for Next.js) or Netlify.
- **Build Verification:**
- Claude must run `npm run build` locally before pushing to ensure zero TypeScript errors or lint issues.
- **Deployment via CLI:**
- For Vercel: Run `npx vercel --prod --yes` or configure GitHub Actions.
- Ensure Environment Variables (`OPENROUTER_API_KEY`, etc.) are documented in `.env.example`.
- **Self-Verification Checklist Before Sharing URL:**
1. Build succeeded cleanly without warnings.
2. All images load over HTTPS without broken links.
3. Mobile drawer and hotspot taps work seamlessly on touch devices.
4. Deployed URL is publicly accessible without login/auth barrier.

---

## 7. Claude Operating Instructions for Prompts

1. **Be Proactive & Autonomous:** Execute shell commands, scaffolding, file creation, and bug fixing directly. Do not stop at pseudo-code; write complete, functioning code.
2. **Brand-Conscious Output:** Never use placeholder text like "Lorem Ipsum". Use rich SUTA-esque microcopy (e.g., *"Woven from memory, draped in longing"*).
3. **No Breaking Changes:** Always inspect existing components and styles before refactoring.
4. **Deliver Deployable Increments:** After any major feature addition, verify the build (`npm run build`) and update instructions for live preview.
