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

## 2025-05-18 - Clearing search inputs correctly
**Learning:** When adding custom "clear" buttons to search inputs, manually setting `input.value = ''` via JavaScript does not natively trigger the `input` or `change` events. This can cause the interface to become desynchronized if list-filtering depends on these events. Additionally, simply clearing the input forces keyboard and screen reader users to manually re-navigate back to the input to type something new.
**Action:** The clear button click handler must explicitly dispatch a new `Event('input')` to ensure reactive filtering logic updates, and it must explicitly call `input.focus()` to prevent keyboard users from losing focus context after the button is clicked.

## 2025-05-18 - Improve Color Contrast
**Learning:** text-gray-400 classes across the app failed WCAG AA contrast ratio against white/light backgrounds.
**Action:** Replaced instances of text-gray-400 with text-gray-500 to ensure color contrast accessibility.

## 2023-10-24 - Modal Focus Trapping in Export Modal
**Learning:** Found a custom export modal (`showExportModal`) that lacked a keyboard focus trap, which violates a11y standards by allowing users to tab into the background page.
**Action:** Implemented a robust Tab/Shift+Tab focus trap loop to constrain focus between the modal's buttons, ensuring screen reader and keyboard accessibility, mirroring the pattern in `showConfirmModal`.

## 2024-05-26 - Adding Loading and Success States to Async Actions
**Learning:** Action buttons that perform asynchronous tasks (like `fillLocationFromGeometry` and `fillBoundsFromGeometry`) should visually indicate that an action is in progress and when it has been completed successfully. This improves user experience by providing immediate feedback.
**Action:** Use a spinner or other loading indicator when an action starts, and display a brief success message/icon (like "Filled!") before reverting the button to its original state. Also use `flashInputFeedback` to visually highlight updated input fields.

## 2024-07-06 - Hidden Element ARIA Misuse
**Learning:** Elements styled with `hidden` or `display: none` are removed from the accessibility tree. Adding `aria-live="polite"` or `aria-atomic="true"` to them makes no sense because screen readers won't observe them. Also, `aria-live` is for dynamic status updates, not for static helper text.
**Action:** Never add `aria-live` to elements designed to be hidden or static description targets. If you need text exclusively for screen readers (like for an `aria-describedby` target), use the `.sr-only` class.

## 2024-07-06 - Redundant ARIA Labels
**Learning:** Adding an `aria-label` that duplicates an element's visible text (e.g., an `aria-label="Create Case"` on a button with the text "Create Case") causes screen readers to redundantly read the label twice, providing a poor experience.
**Action:** Do not use `aria-label` on elements that already have sufficient visible text. Reserve `aria-label` for icon-only buttons or situations where the visible text is insufficient on its own.
