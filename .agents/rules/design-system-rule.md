---
trigger: glob
---

# Design System Rules

Scope: all UI code in the Next.js app.
Source of truth for visual values: `design-tokens.tokens.json`, from which the
CSS variables file is **generated**. These rules exist so the UI stays themeable,
accessible, and semantically honest.

## The two-layer architecture (non-negotiable)

The token file defines two layers, and the boundary between them is the core rule:

1. **Primitive colors** (`--primitive-colors-*`) — the raw palette.
   **Never apply a primitive directly to a UI component.** Not in CSS, not in a
   className, not in an inline style.
2. **Color roles** (`--color-roles-*`) — semantic tokens that reference primitives.
   **All component color comes from roles.** `--color-roles-primary`,
   `--color-roles-error-container`, `--color-roles-on-success`, and so on.

## Hard rules — breaking any of these fails the task even if the UI renders

- **Never hardcode a color.** No hex, no `rgb()`, no `hsl()`, no named CSS colors
  in any component, stylesheet, or inline style. Every color is a
  `--color-roles-*` token. A hardcoded `#741bcd` becomes an untraceable bug the
  day the palette changes.
- **Never use a `--primitive-colors-*` token in a component.** Primitives feed
  roles; components consume roles. If no existing role fits, stop and ask — do
  not promote a primitive.
- **Respect role semantics. Color is functional information in this product:**
  - `error` roles = destructive actions, failures, and danger states only.
  - `warning` roles = degraded or caution states only.
  - `success` roles = completed states only (e.g. an order `DELIVERED`).
  - Never restyle a destructive or failure state with
    `primary`/`secondary`/`tertiary` because it "looks better." Users read
    color before text.
- **Keep role/on-role pairs together.** Text or icons on a role surface use that
  surface's `on-` counterpart: content on `--color-roles-error-container` uses
  `--color-roles-on-error-container`; content on `--color-roles-primary` uses
  `--color-roles-on-primary`. Never place arbitrary-colored content on a role
  surface — the pairs are the accessibility contract.
- **Never edit the generated CSS variables file by hand.** It is generated from
  `design-tokens.tokens.json`; direct edits are silently destroyed on the next
  regeneration. Token additions/changes happen upstream in the source JSON, or
  you stop and ask.
- **Typography comes from the named type styles only** (`display-*`,
  `headline-*`, `title-*`, `body-*`, `button-*`, `caption`, `overline`).
  Never invent a font size, weight, family, or line height. Display and
  headline styles are Lora; title, body, button, caption, overline are Inter —
  that mapping lives in the tokens, not in your judgment.
- **Spacing comes from the spacing scale only:** 0, 4, 8, 12, 16, 20, 24, 32
  (`--spacing-collection-*`). Never write an off-scale margin, padding, or gap
  (no `13px`, no `18px`). If a layout truly needs an off-scale value, stop and
  ask — do not silently add one.
- **Shadows come from the three effect tokens**
  (`--effect-umbra-key-shadow-hard`, `--effect-penumbra-key-shadow-medium`,
  `--effect-ambient-shadow-soft`). Never hand-roll a `box-shadow`.

## Guidance — followed by default, does NOT by itself fail a task

- Prefer `container` roles for large surfaces and base roles for emphasis
  elements (buttons, active states), matching Material-style role usage.
- Use `neutral` / `neutral-variant` roles for chrome, dividers, and de-emphasized
  text rather than reducing opacity on stronger roles.
- Keep paragraph spacing from the type tokens rather than adding ad-hoc margins
  between text blocks.

## When unsure

A missing token is a question, not an invitation. Never invent a color, size, or
style to unblock yourself, and never edit generated files. Follow `AGENTS.md` §7:
smallest correct step, plus a written question naming the exact missing token.
