
## 2026-03-28 - [WCAG 2.5.3 Label in Name and Focus Visible]
**Learning:** Interactive elements with visible text must include that exact text in their `aria-label` to comply with WCAG 2.5.3 (Label in Name) preventing screen reader redundancy. Additionally, custom navigation tabs must use `focus-visible` utility classes to ensure proper keyboard accessibility without showing the focus ring on mouse clicks.
**Action:** Always ensure that `aria-label` contains the exact visible text of an element or is omitted if redundant. Use `focus-visible` on custom UI tabs for keyboard-only focus indicators.
