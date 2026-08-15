# GreekTube Subs — UI Guidelines

These rules are the visual contract for every future change.

## DesignerUI workflow

- For every website, app, dashboard, responsive-layout or visual-polish task, read and apply `.agents/skills/designerui/SKILL.md` before editing UI code.
- Treat supplied screenshots and visual references as design inputs: extract their palette, typography, icon language, density, spacing and hierarchy before deciding what belongs in GreekTube Subs.
- Do not copy references literally. Preserve GreekTube Subs identity and translate only the useful design principles.
- A successful build is not sufficient. Complete the visual and responsive quality gate from the DesignerUI skill before publishing.

## Product direction

- Keep the interface premium, calm and mobile-first with native iPhone-style proportions.
- Preserve the established dark visual identity. Do not introduce unrelated branding, LOGI assets or generic dashboard styling.
- Prefer compact layouts with clear hierarchy. Compact must never mean hard to read.
- Review every change at desktop, tablet and mobile widths before publishing.

## Typography

- Never use interface text below 12px on desktop or 13px on mobile.
- Use 14–16px for controls, menus and important metadata.
- Use font weight 550–700 for interactive labels.
- Maintain strong contrast: primary text at least `#F2F3F6` and secondary text at least `#AEB3BD` on dark surfaces.
- Greek text must be natural and correctly accented. Fully uppercase Greek must not contain tonos.

## Controls and menus

- Touch targets must be at least 44×44px on mobile.
- Buttons must look interactive through shape, border, fill and state feedback.
- Popovers must be compact, anchored to their trigger and use readable labels with 44px rows.
- Selected states must have a clear background, border and checkmark where appropriate.
- Do not create large empty panels around tiny labels.
- Use consistent radii: 10–12px for controls and 12–16px for cards or popovers.

## Player

- Keep the video as the visual priority.
- Keep playback controls and subtitle controls in one clear primary row.
- Keep secondary actions in a separate balanced section.
- The CC menu order is: Χωρίς υπότιτλους, Μικροί, Μεσαίοι, Μεγάλοι.
- Subtitle preferences must persist per browser and must survive app updates.

## Quality gate

- Test every visible interaction and responsive layout.
- Check readable typography, spacing, alignment, contrast, focus states and touch targets.
- Do not publish if any label is too small, clipped, low-contrast or ambiguously interactive.
