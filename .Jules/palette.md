
## 2024-05-15 - Make checkbox labels clickable
**Learning:** In Tailwind CSS, simply wrapping an `<input type="checkbox">` inside a `<label>` provides functional clickability, but users do not inherently know this unless the mouse cursor changes when hovering over the text/gap. Checkbox labels should visually signal they are interactive.
**Action:** Always include the `cursor-pointer` utility class on `<label>` elements that wrap checkboxes. When replacing inner `label` elements with `span`, ensure the `span` also has `cursor-pointer` so the text itself triggers the cursor change.

## 2025-04-07 - Decorative SVGs Require aria-hidden
**Learning:** Decorative `<svg>` icons in the frontend that are missing `aria-hidden="true"` will cause screen readers to announce them redundantly. There were several SVGs in `foamflask_frontend.html` missing this attribute.
**Action:** Always ensure that all decorative `<svg>` icons include the `aria-hidden="true"` attribute exactly once to prevent redundant screen reader announcements.

## 2024-05-25 - Missing aria-label on input
**Learning:** Screen readers often fail to read placeholders reliably as labels, and inputs without explicit associated `<label>` tags require an `aria-label` to be properly identified by assistive technologies.
**Action:** Always ensure that an `aria-label` is present on inputs without explicit associated `<label>`.

## 2024-05-25 - Incorrect application of focus styles to hidden elements
**Learning:** Applying Tailwind focus classes (e.g., `focus:ring-2`) directly to `sr-only` visually hidden inputs (like file uploads) or `<input type="hidden">` is an anti-pattern. Hidden inputs can never receive focus. `sr-only` visually hidden inputs will receive focus, but the focus ring will remain invisible to sighted keyboard users.
**Action:** Focus styles for `sr-only` hidden inputs must be applied to their visible wrapper (e.g., `<label>`) using pseudo-classes like `:focus-within` or peer selectors. Do not apply focus styles to `<input type="hidden">`.
