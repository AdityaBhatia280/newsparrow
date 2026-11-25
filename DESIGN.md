# Sparrow design system: "Sky Glass"

Sparrow is **blue**. The orange identity in older documents is retired.

The look is a midnight-sky canvas, vivid blue gradients, and liquid-glass surfaces. The type system follows Air (air.inc): one sans for the interface, a compressed poster face for headlines, and one cursive accent word per headline. Where Air says "no gradients, no filled buttons, no shadows", Sparrow deliberately uses vivid gradients, gradient primary buttons and soft glass shadows. That was the owner's direction.

Tokens live in `sparrow/src/styles/tokens.css`. Change them there, not in components.

## Color

| Token | Value | Use |
|---|---|---|
| `--void` / `--night` | `#02030a` / `#050a1f` | Canvas |
| `--signal` | `#2b7fff` | Accent, links, primary gradient anchor |
| `--azure` / `--sky` / `--ice` | `#4aa3ff` / `#8fd0ff` / `#d9f0ff` | Highlights, icons, focus ring |
| `--indigo` / `--cyan` | `#4b4dff` / `#22d3ee` | Gradient partners |
| `--twilight` | `#426188` | Decorative large display words only (low contrast) |
| `--text` / `--text-2` / `--text-3` | white / 78% / 58% | Text on dark |
| `--ok` / `--warn` / `--bad` | `#3ddc97` / `#ffc861` / `#ff7d8a` | Status, always with an icon or word |

Gradients:
- `--grad-primary`: primary buttons, the dock lens, selected chips.
- `--grad-indigo`: monograms and numbers.
- `--grad-text`: display headlines.
- `--grad-script`: the cursive accent.
- One gradient tile per opportunity type (`.tile[data-type]`).

## Liquid glass

`.glass` combines a dark legibility tint, a white sheen gradient, `backdrop-filter: blur(22px) saturate(165%)`, a 1px border, a masked gradient rim and an inner top highlight.
- `.glass--strong` uses a denser tint.
- `.glass--interactive` lifts 2px and catches a pointer-following glint.
- `.haze` is Air's light document surface, used for resume text and the brag sheet.

The dock adds a Chromium-only SVG displacement "refraction" (`#liquid-refract` in `app.html`). It's feature-detected through the `refract` class on `<html>`.

**Reduced effects.** `html[data-effects="reduced"]` swaps glass for solid `#0c1846` panels and stops animation. It's set automatically when any of these apply:
- a low-power device (4 or fewer cores, 4 GB or less memory, or Save-Data);
- `prefers-reduced-transparency` or `prefers-reduced-motion`;
- the Reduced choice in Settings → Appearance.

## Type

Fonts are self-hosted from @fontsource (OFL) and copied into `dist/fonts` at build time.

| Role | Face | Rules |
|---|---|---|
| Interface and body | Inter Variable | 400/500, body 16px minimum, scale 13/16/20/32/56 |
| Display | Anton | Uppercase, line-height 0.85–0.88, gradient text, `.display`, `.display--xl` up to 259px |
| Accent | Caveat 600 | One word per headline (`.script`), a plain inline span with **no transform** |

A transformed or inline-block child inside `background-clip: text` leaves ghost strokes in Chrome, so `.script` must stay a plain inline span.

Use `<Display pre accent post />` for headlines.

## Shape, space, motion

- **Radii (Air):** inputs 4px, buttons 8px, cards 12px, media 14px. Pills only for the dock, chips, toggles and segmented controls.
- **Spacing:** 4px base. Content max width 1150px; card padding 20px; section gaps 48px.
- **Easing:** `--ease` is `cubic-bezier(.22,1,.36,1)`; `--spring` is a `linear()` spring used by the dock lens, toggles and dots.
- **Motion:** View Transitions between routes, staggered reveals. Nothing moves under reduced motion.

## The dock

A fixed glass pill at the bottom center: Home · Explore · Colleges · Plan · Advisor.
- A gradient "lens" slides to the active item.
- Labels collapse on scroll-down and on phones (the active label stays).
- Everything else lives in the avatar menu (top right): Profile & activities, Suggest an opportunity, Rewards & AI usage, Settings, Reviewer tools (admins only), Sign out.

## Voice

Respectful and practical:
- Name the next action.
- Never promise admissions results.
- Label estimates as estimates.
- Say "check the official site" when a fact isn't verified.
- Show money only for college costs from the College Scorecard, never for AI usage (that's shown as a percentage).
