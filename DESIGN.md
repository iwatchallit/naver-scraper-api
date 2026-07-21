---
version: 1
name: "Submission Gate Prototype"
description: "Hybrid audit-console UI for the Naver SmartStore scraper submission gate."
colors:
  surface-ink: "#07111f"
  surface-panel: "#0f1728"
  surface-raised: "#151f34"
  surface-hint: "#1d2942"
  surface-soft: "#22304d"
  foreground-bright: "#edf2ff"
  foreground-muted: "#9ba8c8"
  border-subtle: "rgba(155, 168, 200, 0.18)"
  action-blue: "#6ea8ff"
  action-violet: "#8b5cf6"
  warning-amber: "#ffcb66"
  success-mint: "#32d296"
  danger-rose: "#ff6b6b"
typography:
  display-family: "Iowan Old Style, Palatino Linotype, Georgia, serif"
  body-family: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  mono-family: "IBM Plex Mono, ui-monospace, SFMono-Regular, Consolas, monospace"
  body-size: "16px"
  body-line-height: "24px"
  label-size: "13px"
  label-line-height: "18px"
  display-max: "5.5rem"
rounded:
  radius-sm: "8px"
  radius-md: "12px"
  radius-lg: "16px"
  radius-xl: "22px"
spacing:
  spacing-2: "4px"
  spacing-3: "6px"
  spacing-4: "8px"
  spacing-5: "10px"
  spacing-6: "12px"
  spacing-7: "16px"
  spacing-8: "20px"
  spacing-9: "24px"
  spacing-10: "32px"
  spacing-11: "40px"
  spacing-12: "48px"
components:
  shell:
    backgroundColor: "{colors.surface-ink}"
    textColor: "{colors.foreground-bright}"
  panel:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.foreground-bright}"
    borderColor: "{colors.border-subtle}"
    rounded: "{rounded.radius-xl}"
  diagnosis-strip:
    backgroundColor: "{colors.surface-raised}"
    borderColor: "{colors.border-subtle}"
    rounded: "{rounded.radius-lg}"
  matrix-cell:
    backgroundColor: "{colors.surface-hint}"
    borderColor: "{colors.border-subtle}"
    rounded: "{rounded.radius-md}"
---

# Submission Gate Design System

## Creative north star

**The evidence desk at night.**

This interface should feel like a precise internal review surface used by an engineer who needs to understand the source of a blocking problem immediately. The mood is calm, forensic, and high-trust rather than flashy. The design must make one thing obvious first: which gate failed, what the evidence says, and what to do next.

The layout language is hybrid by design: a diagnosis strip leads, a compliance matrix follows. The user should be able to scan left-to-right for cause, evidence, and next action, then drop into the matrix for audit depth.

## Product voice

Copy is direct, short, and evidence-first. Lead with the failure source. Show measured vs required values immediately. Then show the fix or next step. Use sentence case. Avoid copy that sounds theatrical or promotional.

## Color strategy

Use a committed dark strategy: the surface is the brand plane, not a neutral backdrop.

- **Ink** `#07111f`: primary page surface.
- **Panel** `#0f1728`: elevated surface for the hero and main canvas.
- **Raised** `#151f34`: diagnosis strip and section blocks.
- **Hint** `#1d2942`: matrix cells and quiet utility surfaces.
- **Action blue** `#6ea8ff`: links, switches, and selected emphasis.
- **Violet** `#8b5cf6`: supporting accent for depth and variant distinction.
- **Amber** `#ffcb66`: warning and pending emphasis.
- **Mint** `#32d296`: success or passing state.
- **Rose** `#ff6b6b`: failure and blocked state.

Do not rely on color alone for state. Every status needs text plus shape or position. Keep body text high-contrast against dark surfaces. The prototype should never read as a default glassy SaaS shell.

## Typography

Use a strong contrast between heading voice and evidence voice.

- Headlines use a serif display family to make the explanation feel editorial and deliberate.
- Body copy uses a clean sans serif for readability.
- Measured values and file names use a mono stack so evidence reads like evidence.

Display headings should be large but controlled, with balanced line lengths and a maximum around 5.5rem. Body copy stays within 65–75 characters per line. Avoid repeated uppercase eyebrows; use sentence-case labels instead.

## Layout principles

- Use one strong hero statement.
- Put the diagnosis strip first.
- Put the compliance matrix second.
- Keep the floating variant switcher visually separate from the design being judged.
- Avoid nested card stacks. Use full surfaces, separators, and panel blocks instead.
- Make the dominant failure source visible without scrolling.
- Make the audit matrix dense but readable.

## Motion

Motion should be minimal and diagnostic. Use short crossfades or small vertical reveals when switching variants. No bounce, no elastic easing, no decorative looping. Reduced motion must be honored.

## Components

### Status chip

Compact chip for passing, failing, and warning states. Use text and color together. Prefer sentence-case labels.

### Diagnosis strip

The primary block in Variant C. It must show:

- the first failing gate,
- measured vs required,
- the next step to fix it.

### Compliance matrix

The audit block in Variant C. It must show:

- gate name,
- required values,
- measured values,
- evidence file,
- pass/fail state.

### Variant switcher

The floating bottom control is utilitarian, not decorative. It should stay clearly separate from the dashboard composition and disappear in production builds.

## Accessibility

Keep contrast high, focus states visible, and text readable at a glance. The prototype must remain understandable on a small screen. The main diagnostic content should still make sense if the matrix collapses to one column.

## What the prototype should answer

Which visual layout makes a blocked submission gate easiest to understand at a glance, with the hybrid layout acting as the strongest candidate because it puts diagnosis and audit detail together on the same screen.
