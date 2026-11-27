# GreekTube Subs — UI Guidelines

These rules are the visual contract for every future change.

## DesignerUI workflow

- For every website, app, dashboard, responsive-layout or visual-polish task, read and apply `.agents/skills/designerui/SKILL.md` before editing UI code.
- Treat supplied screenshots and visual references as design inputs: extract their palette, typography, icon language, density, spacing and hierarchy before deciding what belongs in GreekTube Subs.
- Do not copy references literally. Preserve GreekTube Subs identity and translate only the useful design principles.
- A successful build is not sufficient. Complete the visual and responsive quality gate from the DesignerUI skill before publishing.

## Premium by default (Adam, 25/11/2026)

- Every screen, in every app we build, is designed to the level of Apple and Google first-party apps. "It works" is not done.
- Settings and preference screens use grouped rows: label (and an optional one-line hint) on the left, a compact control on the right — switch, segmented control, or slider with its value. Never a full-width select or input for a short choice.
- Give each section its own colour (icon tile, switches, selected states) from a small, harmonious palette. Colours must separate sections clearly in both themes.
- Design light and dark separately. Light uses a warm, soft background with white cards that clearly stand off it — never flat grey.
- Where a setting changes something visible, show a live preview next to it.
- Before publishing, compare the result with how Apple or Google would ship the same screen and fix what falls short.

## Product direction

- Keep the interface premium, calm and mobile-first with native iPhone-style proportions.
- Preserve the established dark visual identity. Do not introduce unrelated branding, LOGI assets or generic dashboard styling.
- Prefer compact layouts with clear hierarchy. Compact must never mean hard to read.
- Review every change at desktop, tablet and mobile widths before publishing.

## Typography

- Never use interface text below 12px on desktop or 13px on mobile.
- Controls, menus and labels: 13–14px (labels and fields 13px, weight 500). Metadata 12px. Inputs that can take focus stay 16px on mobile.
- Font weights: 400, 500 and 600 only. Nothing heavier (Adam, 27/11/2026: fonts were too big and too bold).
- Maintain strong contrast: primary text at least `#F2F3F6` and secondary text at least `#AEB3BD` on dark surfaces.
- Greek text must be natural and correctly accented. Fully uppercase Greek must not contain tonos.

## Mobile Safari focus / zoom rule

- Treat iPhone Safari focus zoom as a permanent design QA rule, not a one-off bug.
- Every user-editable `input`, `textarea` and `select`, including search fields, must have an effective mobile font size of at least `16px` whenever it can receive focus. This prevents Safari from auto-zooming the viewport on focus.
- Never solve focus zoom with `maximum-scale=1`, `user-scalable=no` or any viewport setting that disables user zoom/accessibility.
- After every mobile form/search change, test the complete flow: focus → keyboard opens → type → blur/submit → keyboard closes → viewport returns to the original scale and position.
- If the visual design needs a compact field, reduce padding, container height, icon size or surrounding spacing instead of shrinking focused text below `16px`.
- Apply this rule across search, login/profile, settings, editor fields, modals and any future form controls.

## Controls and menus

- Touch targets must be at least 44×44px on mobile.
- Buttons must look interactive through shape, border, fill and state feedback.
- Popovers must be compact, anchored to their trigger and use readable labels. Rows are 34px with a mouse (`pointer: fine`) and 44px on touch.
- Selected states must have a clear background, border and checkmark where appropriate.
- Do not create large empty panels around tiny labels.
- Use consistent radii: 10–12px for controls and 12–16px for cards or popovers.

## Self-evident baseline (Adam, 27/11/2026)

- Full list: project doc `design-rules` and Notion «Platform Foundation — Global Rules» (section «Working products»).
- Never use a native `<select>`, `alert`/`confirm` or `title` tooltip. Use `app/UiDropdown.tsx` and the shared `TooltipLayer`.
- Controls in the same row share height and vertical centre. Nothing touches the edge of its bar (header padding 16px).
- Visible control sizes: 32 / 36 px (44 only for the main play button). Touch devices get a 44px hit area.
- Before saying «done», run `tools/ui-audit.js` on the live page (console or Claude in Chrome) at desktop and 390px, light and dark, and report the result.

## Tables and lists

- Every table or data list with columns (analytics, users, visitors, videos, library, admin screens, and any future site or app we build) must have sortable columns: clicking a column header sorts by it.
- First click gives the natural order (text A→Z, numbers and dates high→low), the second click reverses it, the third clears the sort. The header shows ↕ when inactive and ▲/▼ when active, with `aria-sort`.
- Use the shared helper in `app/admin/analytics/sortable.tsx` (`SortHead`, `sortRows`, `nextSort`) instead of writing a new one. On mobile the sortable headers stay visible as a wrapping row of tappable labels.
- Sort before paginating, and reset to the first page when the sort changes.
- Clicking a row must open its details in the same page (no slow full page reload), with a loading indicator while data loads.

## Player

- Keep the video as the visual priority.
- Keep playback controls and subtitle controls in one clear primary row.
- Keep secondary actions in a separate balanced section.
- The CC menu order is: Χωρίς υπότιτλους, Μικροί, Μεσαίοι, Μεγάλοι.
- Subtitle preferences must persist per browser and must survive app updates.

## Quality gate

- Test every visible interaction and responsive layout.
- Check readable typography, spacing, alignment, contrast, focus states and touch targets.
- On iPhone Safari, explicitly test every focusable form control for unintended viewport zoom and correct scale restoration after blur.
- Do not publish if any label is too small, clipped, low-contrast or ambiguously interactive.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
