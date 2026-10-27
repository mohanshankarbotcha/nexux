---
name: Technical Precision IDE
colors:
  surface: '#121316'
  surface-dim: '#121316'
  surface-bright: '#38393c'
  surface-container-lowest: '#0d0e11'
  surface-container-low: '#1b1b1f'
  surface-container: '#1f1f23'
  surface-container-high: '#292a2d'
  surface-container-highest: '#343538'
  on-surface: '#e3e2e6'
  on-surface-variant: '#c1c7d3'
  inverse-surface: '#e3e2e6'
  inverse-on-surface: '#2f3034'
  outline: '#8b919d'
  outline-variant: '#414751'
  surface-tint: '#a2c9ff'
  primary: '#a2c9ff'
  on-primary: '#00315c'
  primary-container: '#106ebe'
  on-primary-container: '#e7efff'
  inverse-primary: '#0060a9'
  secondary: '#a5ffe7'
  on-secondary: '#00382d'
  secondary-container: '#00ecc7'
  on-secondary-container: '#006655'
  tertiary: '#00dddd'
  on-tertiary: '#003737'
  tertiary-container: '#007979'
  on-tertiary-container: '#a0fffe'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d3e4ff'
  primary-fixed-dim: '#a2c9ff'
  on-primary-fixed: '#001c38'
  on-primary-fixed-variant: '#004881'
  secondary-fixed: '#35fed8'
  secondary-fixed-dim: '#00dfbd'
  on-secondary-fixed: '#00201a'
  on-secondary-fixed-variant: '#005143'
  tertiary-fixed: '#00fbfb'
  tertiary-fixed-dim: '#00dddd'
  on-tertiary-fixed: '#002020'
  on-tertiary-fixed-variant: '#004f4f'
  background: '#121316'
  on-background: '#e3e2e6'
  surface-variant: '#343538'
typography:
  headline-xl:
    fontFamily: Source Serif 4
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Source Serif 4
    fontSize: 1.25rem
    fontWeight: '500'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Source Serif 4
    fontSize: 1rem
    fontWeight: '500'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Courier Prime
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
    letterSpacing: -0.01em
  body-md:
    fontFamily: Courier Prime
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: 0em
  body-sm:
    fontFamily: Courier Prime
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
    letterSpacing: 0em
  label-md:
    fontFamily: Comfortaa
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Comfortaa
    fontSize: 0.6875rem
    fontWeight: '500'
    lineHeight: 0.875rem
    letterSpacing: 0.04em
  code-block:
    fontFamily: Courier Prime
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.35rem
    letterSpacing: 0em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 0.5rem
  margin: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

The design system establishes a high-performance environment engineered specifically for deep-work software construction and multi-agent coordination. Rejecting ephemeral consumer trends, bubbly cards, and excessive ambient glow, this aesthetic combines the strict architectural discipline of Linear and Cursor with terminal ergonomics. The interface acts as an unobtrusive, razor-sharp instrument designed to sustain 8+ hour continuous developer cycles without cognitive friction or ocular fatigue.

Key attributes:
- **Utilitarian & Restrained:** Every line, pixel, and state communicates structural meaning. Whitespace is strictly measured, avoiding both cramped density and wasteful decorative voids.
- **Instrumental Focus:** High contrast between interactive code surfaces, muted panel containers, and stark state accents ensures rapid visual triage across concurrently running agent tasks.
- **Architectural Hierarchy:** Visual weight is established through 1px hairline dividers, distinct surface luminosity tiers, and strict typographical scales rather than drop shadows or heavy fills.

## Colors

The palette is anchored in ultra-deep slate neutrals designed to maximize code and diff readability while minimizing backlight radiation. 

### Palette Architecture
- **Canvas Base:** `#121316` (Primary app backdrop), `#0D0E11` (Terminal/code editor canvas).
- **Surface Elevation:** `#16181D` (Sidebars/rails), `#1A1D23` (Panels/docked tabs), `#22262F` (Hovered row/elevated card), `#2C2E39` (Active selection/overlay).
- **Hairline Dividers:** `#2D313A` (Default panel borders), `#383D48` (Active focus/divider hover).
- **Type Hierarchy:** `#F8F8F9` (Primary foreground / active values), `#A0A5B1` (Secondary metadata/descriptions), `#6B7280` (Muted paths, disabled states, line numbers).
- **Accent Signals:** `#106EBE` serves as the primary system anchor for standard interactive states, selection hulls, and focused inputs. `#0FF0CB` (Mint) and `#00FFFF` (Electric Cyan) are reserved strictly for autonomous agent runtime telemetry, live terminal checkpoints, and active orchestration streams.
- **Diagnostic Tokens:** Success `#31EC56`, Warning `#FFAB00`, Error `#E7473C`, Critical `#D8125B`.

Accent saturation must never exceed 10% of total viewport area; structural neutrals carry the spatial volume.

## Typography

The type system blends structural geometric precision in headings with functional terminal optics throughout execution paths:

1. **Headlines (`Source Serif 4`):** Delivers clean structural definition for viewport headers, panel titles, settings vistas, and primary navigation groupings. Negative tracking tightens spatial footprint without compromising rapid scanning.
2. **Body, Metadata & Logic (`Courier Prime`):** Standardizes all code views, file directory lists, execution logs, prompt composers, and agent timeline entries. Ligatures are disabled in tabular views and metadata to preserve fixed-column precision.
3. **Labels & Micro-copy (`Comfortaa`):** Used in uppercase or tracked monospace for agent state chips, system badges, keyboard shortcuts, and file status metrics.

## Layout & Spacing

The platform utilizes a compact, multi-dock layout model built around a rigid 4px baseline rhythm.

### Layout Topology
- **Primary Tool Rail (Left):** 48px fixed width containing iconographic navigation triggers with tooltips.
- **Secondary Project/Agent Tree (Left Dock):** Fluid width (collapsible, 220px to 360px), housing active run trees, branch switches, and file explorers.
- **Central Core (Dynamic Canvas):** Split into the vertical multi-agent thread (prompt composer, timeline) and the primary editor/diff grid.
- **Contextual Inspector (Right Dock):** Fluid width (collapsible, 280px to 480px) for terminal streams, AST inspection, headless browser preview, or Git staging.

### Rhythmic Density
- Component interiors utilize compact internal padding (`space-xs` and `space-sm`) to maximize visible context lines per viewport.
- Gaps between docked panes are locked to exactly 1px hairline separators or `space-xs` (0.25rem) margins when floating overlays trigger.

## Elevation & Depth

Depth is established strictly via tonal planes and hairline boundaries, entirely eliminating decorative blur effects and heavy diffuse drop-shadows.

1. **Base Tier (Ground):** The workspace floor (`#0D0E11` to `#121316`) resides at depth zero, anchoring long-form code inspection.
2. **Panel Tier:** Docked sidebars and bottom consoles step forward at `#16181D` and `#1A1D23`, framed by a consistent `1px solid #2D313A` rim.
3. **Hover & Active States:** Focused rows, tree selection markers, and active agent cards lift via background tone delta (`#22262F` to `#2C2E39`) without altering layout geometry.
4. **Transient Floating Overlays (Command Palette, Quick-Open, Context Menus):** Positioned on `#1A1D23`, edged with a crisp `1px solid #383D48` border, and grounded with a sharp, low-spread directional drop: `0 8px 24px -4px rgba(0, 0, 0, 0.6)`.

## Shapes

The interface implements a strictly constrained, rounded shape language:

- **Base Radius (0.5rem / 8px):** Standard interactive items including buttons, inputs, context menus, timeline event nodes, and status indicators.
- **Panel Containers & Windows (1rem / 16px):** Outer frame edges for floating modal sheets, detached terminal windows, and command bars.
- **Inner Micro Elements (4px):** Status dots, file extension badges, keyboard shortcut kbd tags, and inline syntax highlights.
- **Pill Elements:** Prohibited for broad UI; reserved exclusively for agent status indicators (e.g., `RUNNING`, `PAUSED`) with a fixed height of 20px and 8px corner radius.

## Components

### Buttons
- **Primary:** Background `#106EBE`, color `#F8F8F9`, 1px border `transparent`. Hover: `#147FD6`. Active: `#0D5A9C`.
- **Secondary / Ghost:** Background `transparent`, color `#A0A5B1`, 1px border `#2D313A`. Hover: background `#1A1D23`, border `#383D48`, color `#F8F8F9`.
- **Agent Action (Terminal Run / Approve):** Background `rgba(15, 240, 203, 0.1)`, 1px border `#0FF0CB`, text `#0FF0CB`.

### Agent Status Chips
- Height: 20px, font: `Comfortaa` 10px uppercase, padding: `0 6px`.
- **Coordinator:** Border `#106EBE`, text `#F8F8F9`, indicator dot solid `#106EBE`.
- **Planner / Explorer:** Border `#2D313A`, text `#A0A5B1`, indicator dot pulsating `#00FFFF`.
- **Coder:** Border `#0FF0CB`, text `#0FF0CB`, background `rgba(15, 240, 203, 0.05)`.
- **Debugger / Reviewer:** Warning orange `#FFAB00` or error crimson `#E7473C` state mapping.

### Prompt & Code Inputs
- **Container:** Background `#0D0E11`, border `1px solid #2D313A`, radius `8px`.
- **Focus State:** Border `1px solid #106EBE`, zero fuzzy outer rings.
- **Model Selector Dropdown:** Flush inline picker at the bottom right of the composer displaying current engine (e.g., `gpt-4o`, `gemini-2.5-pro`) with micro typography and a 1px caret indicator.

### Timeline & Tree Views
- Row height: 26px fixed.
- Indentation: 12px per nesting tier with a `1px` continuous vertical guide line `#22262F`.
- Selection highlight: `#1A1D23` background with a left inset 2px indicator bar colored according to context.

### Form Inputs & Checkboxes
- **Checkboxes:** 14px x 14px square, radius `4px`, background `#121316`, border `1px solid #383D48`. Checked state fills `#106EBE` with sharp white tick.
- **Radio Buttons:** 14px circular rim `#383D48` with a centered 6px dot `#106EBE` when selected.