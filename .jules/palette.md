
## 2024-05-15 - Make checkbox labels clickable
**Learning:** In Tailwind CSS, simply wrapping an `<input type="checkbox">` inside a `<label>` provides functional clickability, but users do not inherently know this unless the mouse cursor changes when hovering over the text/gap. Checkbox labels should visually signal they are interactive.
**Action:** Always include the `cursor-pointer` utility class on `<label>` elements that wrap checkboxes. When replacing inner `label` elements with `span`, ensure the `span` also has `cursor-pointer` so the text itself triggers the cursor change.
