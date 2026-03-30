
## 2026-03-28 - [WCAG 2.5.3 Label in Name and Focus Visible]
**Learning:** Interactive elements with visible text must include that exact text in their `aria-label` to comply with WCAG 2.5.3 (Label in Name) preventing screen reader redundancy. Additionally, custom navigation tabs must use `focus-visible` utility classes to ensure proper keyboard accessibility without showing the focus ring on mouse clicks.
**Action:** Always ensure that `aria-label` contains the exact visible text of an element or is omitted if redundant. Use `focus-visible` on custom UI tabs for keyboard-only focus indicators.

## 2024-10-25 - WCAG 2.5.3 Label in Name for Buttons with Text
**Learning:** Several buttons in the application (like "Update" or "Auto-fill from selected Geometry") contained visible text, but their `aria-label`s described the action (e.g., "Update Docker configuration") without including the visible text. This violates WCAG 2.5.3 (Label in Name), which requires the visible text to be part of the accessible name.
**Action:** Always ensure that when adding an `aria-label` to an interactive element that already has visible text, the `aria-label` contains the exact visible text (e.g., `aria-label="Update: Update Docker configuration"`) to comply with accessibility standards.

## 2026-03-29 - [WCAG 2.5.3 Empty State Action Buttons Context]
**Learning:** Action buttons located within empty states (e.g., `#geometryPlaceholder`, `#meshPlaceholder`) often exist simply to jump focus to a related element (like a dropdown) rather than immediately performing the action their label suggests. Screen reader users navigating by interactive elements may lose the surrounding descriptive context, finding "Select File" ambiguous when it merely focuses another element.
**Action:** When empty state buttons only shift focus or navigate, append a colon and descriptive context to their `aria-label` while preserving their exact visible text (e.g., `aria-label="Select File: Focus the geometry selection list"`). This clarifies their behavior while adhering to WCAG 2.5.3.

## 2026-03-31 - [Decorative SVG aria-hidden Duplication]
**Learning:** Decorative `<svg>` icons should include `aria-hidden="true"` exactly once. Duplicating this attribute is a common issue when dynamically generating HTML strings or copy-pasting code, and can cause standard compliance warnings and potential screen reader verbosity issues.
**Action:** Always verify that dynamically injected UI elements (e.g. loading spinners, icons) and statically defined HTML SVGs have exactly one `aria-hidden="true"` attribute to maintain clean and accessible DOM structures.
