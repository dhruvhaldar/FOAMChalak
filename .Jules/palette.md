## 2025-02-19 - [Refresh Button Pattern]
**Learning:** The application uses a consistent pattern for 'Refresh' buttons: manually injecting a spinner SVG and 'Refreshing...' text, disabling the button, and restoring original HTML in 'finally'. It does NOT use the 'temporarilyShowSuccess' helper for these (which shows a checkmark), likely because refresh is an idempotent status check rather than a state-changing action.
**Action:** When adding or improving refresh buttons, follow the manual spinner injection pattern rather than using generic success helpers.

## 2025-05-21 - [Input Validation Feedback]
**Learning:** Inputs in this app (specifically vector inputs like '20 20 20') often lack validation, leading to silent backend failures. Retasking the existing `flashInputFeedback` (originally for 'success' green flashes) to support 'error' red flashes provides a cheap, consistent, and highly visible way to communicate format errors without implementing complex form validation libraries.
**Action:** Use `flashInputFeedback(el, msg, true)` for lightweight client-side validation errors instead of generic toast notifications when the error is specific to an input field.

## 2025-06-12 - [Dynamic Form Feedback Accessibility]
**Learning:** This application extensively uses inline helper text (via `aria-describedby`) to provide dynamic validation or auto-formatting feedback (e.g., formatting vectors or case names on blur). Because this feedback occurs *after* the user's focus has left the field, screen readers will not naturally announce it. Adding `aria-live="polite" aria-atomic="true"` to these helper `<p>` tags ensures the feedback is announced without interrupting the user.
**Action:** Always add `aria-live="polite" aria-atomic="true"` to form helper text elements if their text content is manipulated dynamically by JavaScript.

## 2025-06-12 - [Plotly Keyboard Accessibility]
**Learning:** Plotly modebars (toolbars) are only visible on mouse hover by default (`.plot-container:hover .modebar`). This completely excludes keyboard-only and screen reader users from accessing critical interactive features like zoom, pan, and download.
**Action:** Always append `:focus-within` to the hover CSS rules for Plotly modebars (e.g., `.plot-container:focus-within .modebar`) so that tabbing into the plot container forces the modebar to appear and become operable.
## 2026-03-01 - Added missing aria-labels to main action buttons
**Learning:** Adding explicit aria-labels and descriptive titles to primarily icon-or-text action buttons (like 'Create Case', 'Update View', etc.) makes the UI significantly more accessible for screen readers without altering visual layout. Found that many key action buttons were missing comprehensive descriptions.
**Action:** Always check form and primary interaction buttons for accessibility context beyond their visual text, especially in dynamic applications.

## 2026-03-03 - Focus Rings for Dynamically Generated Interactive Elements
**Learning:** In heavily dynamic UI frameworks or vanilla JS applications, elements that are dynamically injected into the DOM (like the `.copyable-value` buttons in the Geometry and Mesh info panels) are often overlooked for basic accessibility styling compared to their static counterparts. Specifically, failing to include keyboard focus rings (`focus:outline-none focus:ring-2`) makes them invisible to keyboard-only users navigating the interface.
**Action:** Always cross-reference the styles applied to interactive elements in static HTML with their equivalents generated in TypeScript/JavaScript template strings. Create a shared styling constant or strictly ensure focus-visible styles are manually added to all dynamically created buttons and links.

## 2026-03-15 - [Decorative SVGs Accessibility]
**Learning:** Found that many `<svg>` icons used inside buttons and links lacked the `aria-hidden="true"` attribute. This causes screen readers to potentially read out meaningless or confusing descriptions for these SVG elements, when the parent button's text or `aria-label` is already sufficient.
**Action:** Always add `aria-hidden="true"` to purely decorative `<svg>` elements inside interactive components to streamline the experience for screen reader users.

## 2026-03-15 - Focus Rings for Primary Navigation and Custom Dropdowns
**Learning:** Found that custom-built navigation elements (like the desktop and mobile nav bars) and custom dropdown menus often strip default browser focus rings without providing alternative `focus-visible` styling. This creates a severe accessibility barrier where keyboard-only users cannot perceive their current location within the main site navigation or menu options.
**Action:** Ensure all navigation buttons (`nav-btn`), custom dropdown items (`role="menuitem"`), and dialog close buttons explicitly define focus-visible styling (e.g., `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500`) to guarantee keyboard accessibility.

## 2026-03-15 - Focus Rings for Secondary Inputs and Advanced Settings
**Learning:** In complex configuration panels like Advanced Settings or Meshing settings, inputs (like docker image versions, shm location vectors, custom VTK file browsers) and secondary action buttons (`setRootBtn`, `setDockerConfigBtn`) often miss standard keyboard focus outlines compared to primary forms. This creates a confusing experience for power users navigating via keyboard.
**Action:** Consistently apply standardized focus utility classes (e.g. `focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500`) to all form inputs and interactive elements, even those buried in collapsible details menus or secondary tabs.
## 2026-04-01 - Add missing aria-labels to select elements
**Learning:** Found that `<select>` elements used as configuration dropdowns (like Active Case, Tutorial Source, Available Geometries, etc.) often lacked `aria-label` attributes. This reduces accessibility for screen reader users since they would not be able to determine the purpose of the dropdown when focusing on it.
**Action:** Always verify that all `<select>` form elements have explicit `aria-label`s describing their purpose or function.

## 2026-04-02 - Consistent Cursor-Pointer on Checkboxes
**Learning:** Found that several checkbox inputs (`<input type="checkbox">`) and their associated `<label>` wrappers/elements lacked the `cursor-pointer` class. This inconsistency meant users hovering over these interactive elements did not receive standard pointer cursor feedback, creating a slightly confusing UX, especially when other interactive elements (like buttons) provided clear feedback.
**Action:** Always verify that both the `input[type="checkbox"]` and its corresponding `<label>` (either wrapping the input or using `for="id"`) include the `cursor-pointer` utility class to clearly indicate they are clickable.

## 2026-04-03 - Focus Rings for Hidden-Until-Hover Overlay Buttons
**Learning:** Found that interactive overlay buttons (like Plotly download options "CSV/PNG" and 3D viewer camera controls) which are visually hidden until hover (`opacity-0 group-hover:opacity-100`) often lack explicit focus rings. While they do become visually apparent via `focus:opacity-100` or `focus-within:opacity-100` when tabbed to, the keyboard user has no visual indication of *which* specific button currently holds focus within the newly visible group because the browser's default focus ring was either overridden or insufficient against the button's background.
**Action:** Consistently add explicit focus rings (e.g., `focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-1`) to all hidden-until-hover overlay buttons to ensure keyboard users can track their exact position within the revealed element group.

## 2026-03-15 - [Required Form Field Indicators]
**Learning:** Found that some required configuration inputs (specifically the vector inputs like `bmMin`, `bmMax`, `bmCells`, `bmGrading`, and `shmLocation` in the Meshing tab) lacked visual "required" indicators, despite being strictly validated by the frontend (`validateVector3` helper). This creates a disjointed experience where users only learn a field is required after attempting an action.
**Action:** Consistently include a red asterisk (`<span class="text-red-500" title="Required">*</span>`) inside the `<label>` of any form input that is mandatory for the current operation, ensuring users understand requirements upfront.

## 2026-04-04 - [Refresh Button ARIA-Busy State]
**Learning:** Found that while the application's refresh buttons visually disabled themselves and displayed a spinner, they were missing the standard `aria-busy="true"` attribute during their async loading state. This prevented screen readers from correctly announcing that the related section was updating. Additionally, some refresh buttons (like the `resourceGeometrySelect` refresh) were missing the standardized "Refreshing..." text, causing inconsistency in user feedback.
**Action:** For all refresh buttons, ensure that `aria-busy="true"` is applied when loading and removed in the `finally` block, and verify that the HTML spinner includes standardized text (e.g., "Refreshing...").