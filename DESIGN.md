# ChefFlow Design System

**Version:** 1.0 · **Status:** draft · **Last updated:** 2026-05-17

The canonical design language for all ChefFlow surfaces — the main app (this repo, `ChefFlow-Beta-v2`), the hosted command center (`chefflow-dashboard.vercel.app`), and any future ChefFlow product. Framework-agnostic at the token level; adoption snippets for Tailwind v4 and inline React are at the bottom.

> **Canonical implementation:** the ChefFlow Command Center dashboard. Source: `github.com/hmonterr/chefflow-dashboard` · Live: https://chefflow-dashboard.vercel.app · Local clone: `~/OneDrive/Documents/Coding/Projects/ChefFlow Dash/index.html`. Every token below is in production on that surface. When a token here conflicts with code, the dashboard wins until this doc is updated to match.

---

## 1. Brand

**Identity.** A warm, calm, kitchen-notebook feel — not a tech dashboard. Cream backgrounds with desaturated pastel accents do the work; the single peach accent (`#E89765`, the chef-hat color) is the only saturated color in the system.

**Mark.** A line-drawn chef hat (24×24 SVG, stroke `#E89765`, `strokeWidth=1.8`, rounded caps). Used as favicon and in-app `<ChefHat>` component.

**Voice in UI copy.** Short, direct, lowercase chips for status. Title-case for section headers. No exclamation marks. No tooltips that explain the obvious.

---

## 2. Color tokens

### 2.1 Surface — light theme

| Token | Value | Use |
|---|---|---|
| `bg` | `#FAF6EF` | Page background (eggshell) |
| `surface` | `#FFFDF9` | Card / panel background |
| `surface2` | `#F1ECE2` | Recessed surface, nested cards, inactive button bg |
| `inputBg` | `#F7F4ED` | Text input background |
| `border` | `rgba(60,45,30,0.09)` | Default border / divider |
| `text` | `#000000` | Primary text |
| `muted` | `rgba(0,0,0,0.55)` | Secondary text |
| `dim` | `rgba(0,0,0,0.30)` | Tertiary text, disabled state |

### 2.2 Surface — dark theme

| Token | Value | Use |
|---|---|---|
| `bg` | `#211C16` | Page background (dark warm brown) |
| `surface` | `#2B2620` | Card / panel background |
| `surface2` | `#342E27` | Recessed surface |
| `inputBg` | `#2B2620` | Text input background |
| `border` | `rgba(245,233,215,0.07)` | Default border |
| `text` | `#ECE3D2` | Primary text (warm off-white) |
| `muted` | `rgba(236,227,210,0.52)` | Secondary text |
| `dim` | `rgba(236,227,210,0.30)` | Tertiary text |

### 2.3 Accent (mode-shared)

| Token | Value |
|---|---|
| `accent` | `#E89765` |
| `accentDim` *(light)* | `rgba(232,151,101,0.12)` |
| `accentDim` *(dark)* | `rgba(232,151,101,0.18)` |
| `accentBorder` *(light)* | `rgba(232,151,101,0.24)` |
| `accentBorder` *(dark)* | `rgba(232,151,101,0.30)` |

The accent is the only saturated color in the system. Use it sparingly — on the brand mark, on one or two primary actions per view, and as `accentDim` background for "Claude-owned" tags.

### 2.4 Bug priority (mode-aware)

| Priority | Light | Dark |
|---|---|---|
| Critical | `#C6727A` | `#D88087` |
| High | `#D98A91` | `#E29CA2` |
| Medium | `#D6B675` | `#E0C385` |
| Low | (falls through to `dim`) | (falls through to `dim`) |

### 2.5 Agent colors (five buckets)

Used to identify each agent (a1–a5+) across cards, badges, and timelines.

| Bucket | Light fg | Dark fg | Dim bg |
|---|---|---|---|
| `red` | `#D98A91` | `#E29CA2` | `rgba(217,138,145,0.18)` |
| `blue` | `#9BA5DC` | `#A8B2E2` | `rgba(155,165,220,0.18)` |
| `green` | `#8FB89C` | `#9CC4A8` | `rgba(143,184,156,0.18)` |
| `grey` | `#A89E92` | `#B5ABA0` | `rgba(168,158,146,0.18)` |
| `purple` | `#B89BD4` | `#C5A9DE` | `rgba(184,155,212,0.18)` |

Current agent assignments: **a1 red, a2 blue, a3 green, a4 grey (retired), a5 purple.**

### 2.6 Owner tags

For attributing tasks/items to a human, an agent, or a joint owner.

| Owner | Background | Foreground | Border |
|---|---|---|---|
| `You` | `surface2` | `muted` | `border` |
| `Claude` | `accentDim` | `accent` | `accentBorder` |
| `You+Claude` | `surface2` | `text` | `border` |
| `Outcome` | green-bucket `dim` | green-bucket `fg` | green-bucket `dim` |

---

## 3. Typography

**Font:** [Inter](https://rsms.me/inter/) — `'Inter', -apple-system, sans-serif`. The only typeface in the system. Loaded via Google Fonts with weights `300, 400, 500, 600, 700, 800, 900`.

**No real monospace.** Where you'd reach for a mono typeface (status chips, terminal-styled labels), the system uses Inter at small sizes with uppercase letter-spacing instead. This is a deliberate aesthetic choice — keep one typeface, lean on weight and spacing.

### Type scale

| Use | Size | Weight | Letter-spacing | Transform |
|---|---|---|---|---|
| Section title (h2) | `18px` | `700` | `-0.3px` | — |
| Card title | `13px` | `600` | — | — |
| Body / input | `12px` | `400` | — | — |
| Pill, AddBtn, Select | `11px` | `600` | — | — |
| Badge | `10px` | `600` | `0.5px` | uppercase |
| Section sub-label | `10px` | `400` *(opacity 0.5)* | `1.5px` | uppercase |
| Owner tag | `8.5px` | `400` | `0.8px` | uppercase |

Avoid sizes outside this scale.

---

## 4. Spacing

No fixed scale; recurring values are:

| Element | Padding |
|---|---|
| Pill, AddBtn | `4px 12px` |
| Input | `5px 8px` |
| Select | `4px 6px` |
| Card header | `12px 16px` |
| Migration banner | `9px 20px` |
| Owner tag | `2px 6px` |
| Badge | `2px 8px` |
| XBtn (close) | `22×22px` (no padding, centered glyph) |

**Gap between flex items:** `8–12px` is typical.
**Section bottom margin:** `16px`.

---

## 5. Border radius

| Element | Radius |
|---|---|
| Owner tag | `4px` |
| XBtn (close) | `5px` |
| Input, Select, Banner button | `6px` |
| AddBtn | `8px` |
| Badge | `10px` |
| Card | `12px` |
| Pill | `16px` |
| Status dot | `50%` (circle) |

Bigger surfaces get bigger corners, capped at 16px. Avoid pill-shaped (`9999px`) corners — they read too consumer-y for this aesthetic.

---

## 6. Borders & states

- **Standard border:** `1px solid ${border}` — warm subtle.
- **Highlighted border:** `1px solid ${accentBorder}` — peach.
- **Faded state (retired agents, deferred items):** `opacity: 0.55` on the whole card.
- **Button hover:** `opacity: 0.85`.
- **Link hover:** `opacity: 0.80`.
- **Status dot:** `7×7px`, circular, color = context.

No shadows. The system uses borders + subtle background contrast for layering instead.

---

## 7. Component atoms (reference)

The dashboard's working set. Every value is already documented above; this table maps name → tokens used.

| Atom | Bg | Border | Radius | Padding | Text |
|---|---|---|---|---|---|
| `Card` | `surface` | `border` *or* `accentBorder` if highlighted | `12px` | content-dependent | — |
| `CardH` (card header) | inherits | `border` (bottom only) | — | `12px 16px` | `13px / 600` |
| `Badge` | `surface2` *or* agent-`dim` | `border` *or* agent-`dim` | `10px` | `2px 8px` | `10px / 600`, uppercase, `0.5px` LS |
| `Pill` | `accentDim` if active else transparent | `accentBorder` if active else `border` | `16px` | `4px 12px` | `11px / 600` |
| `AddBtn` | `accentDim` | `accentBorder` | `8px` | `4px 12px` | `11px / 600` |
| `XBtn` (close) | `surface2` | `border` | `5px` | — | `13px`, centered |
| `Inp` (text input) | `inputBg` | `border` | `6px` | `5px 8px` | `12px / 400` |
| `Sel` (select) | `inputBg` | `border` | `6px` | `4px 6px` | `11px / 600` |
| `OwnerTag` | per owner map | per owner map | `4px` | `2px 6px` | `8.5px / 400`, uppercase, `0.8px` LS |
| `Dot` | context | — | `50%` | — | — |

---

## 8. Iconography

- **Brand mark:** chef-hat SVG line drawing, `viewBox 0 0 24 24`. See `ChefFlow Dash/index.html` line 45 for the exact path.
- **Inline glyphs:** the dashboard uses Unicode geometric shapes (`⌂ ◈ ◇ ▣ ▤ ◻ ▦ ◎`) as section/link icons, not an icon library. The one true emoji is `🧑‍🍳` for the Beta App quick-link.
- **Main app convention:** Lucide Icons (per CLAUDE.md stack note). When porting dashboard styling into the main app, prefer Lucide line-style icons at 16–20px stroked `1.5–1.8`, color = `muted` by default, `accent` when active.

---

## 9. Animation

```css
@keyframes pulse {
  0%, 100% { opacity: 1;   transform: scale(1); }
  50%      { opacity: 0.4; transform: scale(0.75); }
}
```

One animation, used on small status dots for heartbeat. Do not add more easings or durations without updating this doc.

**Hover transitions:** none beyond opacity. Keep it instant. Anything animated should communicate live state (pulse, refresh spin), not decorate.

---

## 10. Scrollbar

```css
::-webkit-scrollbar       { width: 3px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.18); border-radius: 3px; }
```

3px, near-invisible. Deliberately doesn't compete with content.

---

## 11. Adoption guides

### 11.1 Tailwind v4 (main app — ChefFlow-Beta-v2)

The main app uses Tailwind v4 via `@tailwindcss/vite`. Add this `@theme` block to the project's global CSS (typically `src/index.css` or wherever `@import "tailwindcss"` lives):

```css
@import "tailwindcss";

@theme {
  /* Brand */
  --color-accent: #E89765;
  --color-accent-dim: rgb(232 151 101 / 0.12);
  --color-accent-border: rgb(232 151 101 / 0.24);

  /* Light theme — defaults */
  --color-bg: #FAF6EF;
  --color-surface: #FFFDF9;
  --color-surface-2: #F1ECE2;
  --color-input-bg: #F7F4ED;
  --color-border: rgb(60 45 30 / 0.09);
  --color-text: #000000;
  --color-muted: rgb(0 0 0 / 0.55);
  --color-dim: rgb(0 0 0 / 0.30);

  /* Priority */
  --color-priority-critical: #C6727A;
  --color-priority-high: #D98A91;
  --color-priority-medium: #D6B675;

  /* Agent buckets */
  --color-agent-red: #D98A91;
  --color-agent-blue: #9BA5DC;
  --color-agent-green: #8FB89C;
  --color-agent-grey: #A89E92;
  --color-agent-purple: #B89BD4;

  /* Type */
  --font-display: "Inter", "system-ui", sans-serif;
  --text-section: 18px;
  --text-card: 13px;
  --text-body: 12px;
  --text-pill: 11px;
  --text-badge: 10px;
  --text-owner: 8.5px;

  /* Radius */
  --radius-input: 6px;
  --radius-add: 8px;
  --radius-badge: 10px;
  --radius-card: 12px;
  --radius-pill: 16px;
}

/* Dark theme override */
@media (prefers-color-scheme: dark) {
  @theme {
    --color-bg: #211C16;
    --color-surface: #2B2620;
    --color-surface-2: #342E27;
    --color-input-bg: #2B2620;
    --color-border: rgb(245 233 215 / 0.07);
    --color-text: #ECE3D2;
    --color-muted: rgb(236 227 210 / 0.52);
    --color-dim: rgb(236 227 210 / 0.30);

    --color-accent-dim: rgb(232 151 101 / 0.18);
    --color-accent-border: rgb(232 151 101 / 0.30);

    --color-priority-critical: #D88087;
    --color-priority-high: #E29CA2;
    --color-priority-medium: #E0C385;

    --color-agent-red: #E29CA2;
    --color-agent-blue: #A8B2E2;
    --color-agent-green: #9CC4A8;
    --color-agent-grey: #B5ABA0;
    --color-agent-purple: #C5A9DE;
  }
}
```

Then in components:

```tsx
<div className="bg-surface text-text border border-border rounded-card p-4">
  <span className="text-pill font-semibold text-muted">Pending</span>
</div>
```

### 11.2 Inline React style props (dashboard's current pattern)

The dashboard at `ChefFlow Dash/index.html` already implements every token via two theme objects (`LIGHT`/`DARK` on lines 48–49). For any new surface that follows that pattern, copy those two objects verbatim and the agent-color map below them. Do not redefine values — import the constants.

### 11.3 CSS variables (any plain HTML/CSS surface)

```css
:root {
  --cf-bg: #FAF6EF;
  --cf-surface: #FFFDF9;
  --cf-surface-2: #F1ECE2;
  --cf-accent: #E89765;
  --cf-text: #000;
  --cf-muted: rgba(0,0,0,0.55);
  --cf-border: rgba(60,45,30,0.09);
  --cf-radius-card: 12px;
  --cf-radius-pill: 16px;
  --cf-font: 'Inter', -apple-system, sans-serif;
}
```

---

## 12. What this system is NOT

Avoid these — they break the aesthetic:

- **Saturated colors** other than the peach accent. No bright reds, hot pinks, electric blues. If a status needs to read "urgent," use `priority-critical` (a muted brick), not vermilion.
- **Drop shadows or elevation layers.** This system uses borders and `surface2` recessed backgrounds instead.
- **Multiple typefaces.** Inter only. Resist the urge to add a "real" mono.
- **Pill-shaped buttons** (`border-radius: 9999px`). Cap at 16px.
- **Decorative animations** beyond the single pulse keyframe. Hover = opacity change, end of story.
- **Tooltips on every icon.** Inline glyphs should be either obvious or labeled adjacent.
- **Light/dark via `dark:` Tailwind utility classes everywhere.** Use the `@theme` override on `prefers-color-scheme: dark` so the rest of the code stays clean.

---

## 13. Update process

This doc is the source of truth. When tokens change:

1. Open a PR to this file describing the change and why.
2. Update the canonical implementation (`ChefFlow Dash/index.html`) in the same or a follow-up PR.
3. If the main app has adopted the system, update its `@theme` block to match.
4. Bump the version at the top.

If the code drifts from this doc, the **dashboard wins** until this doc is brought back into sync. Don't let docs lie.
