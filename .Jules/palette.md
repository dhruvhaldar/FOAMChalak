
## 2026-03-28 - [WCAG 2.5.3 Label in Name and Focus Visible]
**Learning:** Interactive elements with visible text must include that exact text in their `aria-label` to comply with WCAG 2.5.3 (Label in Name) preventing screen reader redundancy. Additionally, custom navigation tabs must use `focus-visible` utility classes to ensure proper keyboard accessibility without showing the focus ring on mouse clicks.
**Action:** Always ensure that `aria-label` contains the exact visible text of an element or is omitted if redundant. Use `focus-visible` on custom UI tabs for keyboard-only focus indicators.

## 2024-10-25 - WCAG 2.5.3 Label in Name for Buttons with Text
**Learning:** Several buttons in the application (like "Update" or "Auto-fill from selected Geometry") contained visible text, but their `aria-label`s described the action (e.g., "Update Docker configuration") without including the visible text. This violates WCAG 2.5.3 (Label in Name), which requires the visible text to be part of the accessible name.
**Action:** Always ensure that when adding an `aria-label` to an interactive element that already has visible text, the `aria-label` contains the exact visible text (e.g., `aria-label="Update: Update Docker configuration"`) to comply with accessibility standards.
