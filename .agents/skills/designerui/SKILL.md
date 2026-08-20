---
name: designerui
description: Design and refine premium production web interfaces. Use for website, app, dashboard, responsive UI, visual polish, screenshot-reference work, component styling, design-system changes and UI regression audits. Do not use for backend-only tasks unless the backend change directly affects UI behavior.
---

# DesignerUI

Use this skill whenever the task is primarily visual product design or front-end UX.

## Objective

Produce interfaces that feel deliberately designed, premium, modern and production-ready. Favor quiet confidence over novelty. Preserve strong existing product identity and improve weak points strategically instead of redesigning everything by default.

## Reference-first workflow

When screenshots, websites or visual references are provided:

1. Extract the visual language before coding: palette, contrast, typography, spacing, icon style, border treatment, shadows, radii, density, hierarchy and interaction feel.
2. Reuse principles rather than copying a reference literally.
3. Identify which reference qualities improve the current product and which would conflict with its identity.
4. Build a small coherent token system before styling individual components.

## Design rules

- Mobile-first always. Desktop must feel spacious without becoming empty.
- Prefer compact native-app proportions, restrained radii and intentional spacing.
- Use small refined typography but never sacrifice readability.
- Create clear surface hierarchy: page, section, card and interactive control must not collapse into the same brightness or elevation.
- Use one primary accent system and a small number of supporting semantic colors.
- Prefer thin-line icons with consistent stroke weight over mixed emoji, random glyphs or decorative symbols.
- Avoid oversized controls, game-like buttons, generic SaaS dashboard styling, excessive pills, glassmorphism everywhere, giant empty cards and unnecessary gradients.
- Buttons must look interactive through shape, contrast, hover/focus state and correct touch size.
- Forms, search fields, selects, date fields and filters must look like deliberate product components rather than browser defaults.
- Preserve content hierarchy. Media-heavy products should keep media visually dominant.
- Whitespace must be purposeful. Large accidental blank areas are defects.
- Footer spacing must feel finished and intentional at every viewport.
- Light and dark themes must each be designed, not mechanically inverted.

## Typography

- Prefer one primary UI sans family unless a second editorial face adds clear value.
- Use weight and spacing for hierarchy before increasing font size.
- Keep metadata readable and avoid low-contrast gray-on-gray text.
- Greek text must be natural and correctly accented.
- Fully uppercase Greek must not contain tonos.

## Mobile Safari focus and viewport stability

- Treat iPhone Safari focus zoom as a permanent design QA concern on every project.
- Any focusable `input`, `textarea` or `select` must have an effective mobile font size of at least `16px` whenever it can receive focus. This includes search, login/profile, settings, editor, modal and filter fields.
- Never fix Safari focus zoom by disabling pinch zoom or accessibility with `maximum-scale=1`, `user-scalable=no` or equivalent viewport restrictions.
- If a field must look compact, reduce padding, height, icon scale and surrounding spacing rather than shrinking editable text below `16px`.
- After any mobile form or search change, test: focus → keyboard open → type → blur/submit → keyboard close → verify the viewport returns to its original scale and position.
- Unexpected zoom, viewport drift or failure to restore after blur is a release-blocking mobile regression.

## Interaction language

- Use 44px minimum touch targets on mobile when controls are intended for touch.
- Hover, active, focus and disabled states must all be designed.
- Menus and popovers should be anchored, compact and visually connected to their trigger.
- Use subtle motion only when it clarifies state, hierarchy or continuity.
- Respect `prefers-reduced-motion`.

## Implementation discipline

1. Audit the current DOM and CSS before changing anything.
2. Identify the final style layer and specificity conflicts before adding overrides.
3. Prefer a scoped final override file for controlled visual passes over risky edits to large legacy stylesheets.
4. Do not alter functionality while doing a visual-only pass unless explicitly requested.
5. Reuse existing components and tokens when they are already strong.
6. Avoid duplicated rules and unnecessary `!important`; use boosted specificity only when legacy CSS makes it necessary.
7. Keep theme-specific rules explicitly scoped.
8. Protect responsive behavior and avoid horizontal scroll.
9. Do not ship visual fixes that create accessibility or performance regressions.

## Quality gate

Before completion, review desktop, tablet and mobile and verify:

- visual hierarchy
- typography and contrast
- alignment and spacing
- surface separation
- icon consistency
- button and field states
- responsive wrapping
- no clipping or horizontal overflow
- no accidental blank regions
- theme parity
- focus visibility
- touch targets
- mobile form focus does not trigger unintended Safari zoom or viewport drift
- loading and empty states
- footer finish
- existing functionality still works

Run available build, lint and UI/functionality checks. Do not treat a successful build as sufficient visual QA.