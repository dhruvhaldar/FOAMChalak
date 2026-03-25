# Palette's Journal

## 2026-01-15 - Missing Loading States on Async Actions
**Learning:** Users lack feedback during blocking async operations like generating mesh configuration, leading to uncertainty if the action was registered.
**Action:** Always wrap async fetch calls in a try/finally block that toggles a loading state (spinner/disabled) on the triggering button.

## 2026-01-20 - Modal Focus Trapping
**Learning:** Custom modals implemented as appended DOM elements often miss keyboard focus management, allowing users to Tab out of the modal into the background page, which violates accessibility standards and confuses screen reader users.
**Action:** Always implement a focus trap loop (handling Tab and Shift+Tab) within custom modals and restore focus to the previously active element upon closure.

## 2026-01-26 - Protecting Reproducible Data
**Learning:** Even "view-only" data like simulation logs, which are expensive to reproduce (requiring re-running a simulation), should be treated as destructive deletions when cleared. Users often treat the log as a persistent record of the run.
**Action:** Apply confirmation patterns not just to file deletions, but also to clearing significant UI state/logs that represent long-running processes.

## 2025-10-26 - File Input Accessibility Gaps
**Learning:** File inputs hidden inside custom UI widgets (like accordions or custom uploaders) often lose their semantic labeling, leaving screen reader users guessing what the "Choose File" button is for.
**Action:** Always verify that `<input type="file">` elements have either a visible `<label>` via `for/id` or an `aria-label` if the UI implies the label contextually.

## 2025-10-27 - Styling Native Details
**Learning:** Native `<details>` elements are extremely hard to style consistently across browsers, especially the `marker` (triangle).
**Action:** Hide the default marker with `list-none` and `[&::-webkit-details-marker]:hidden`, then use a flex container with a custom SVG icon that rotates using `group-open:rotate-180` for a clean, animated accordion.

## 2026-01-21 - Keyboard Shortcuts for Selection Inputs
**Learning:** Users expect "Enter" to trigger the primary action associated with an input or selection, even if it's not in a `<form>`. Double-clicking items in a listbox is a standard pattern for "Select & Action" on desktop interfaces.
**Action:** Always bind "Enter" on non-form inputs/selects to their primary action button, and "Double Click" on listbox elements (`size > 1`) to trigger the view/select action.

## 2026-01-24 - [Polling vs WebSockets for Reliability]
**Learning:** WebSocket connections often fail silenty or require complex error handling in corporate environments (proxies/firewalls), leading to "stuck" UIs.
**Action:** Replaced WebSocket-based real-time updates with robust HTTP polling (`/api/plot_data`). While slightly less efficient, it drastically improves reliability and consistency of the user experience across different network configurations.

## 2026-01-24 - [Console Log Expectations vs Technical Reality]
**Learning:** Users expect a "Console Log" to show *container output*, even if the underlying tool (OpenFOAM) redirects its useful output to internal files. Merging internal logs into the console stream can be confusing if the user strictly expects standard output.
**Action:** Respect the user's mental model of "Console Log". If the tool is silent, show silence (or a helper message), but don't magically merge hidden files unless explicitly requested or designed as a "Super Log". Simplicity and predictability outrank thoroughness in this context.

## 2026-01-24 - [State Restoration Ordering]
**Learning:** In complex Dashboards, restoring user preferences (like "Selected Tutorial") must happen *synchronously* or strictly *before* any data fetching logic runs.
**Action:** Move state restoration logic to the very top of the initialization chain (`init()`), guaranteeing that when the UI "wakes up" and requesting data, it asks for the *right* data immediately, avoiding 404s and flickering.

## 2026-02-13 - [Empty States for Dependent Pages]
**Learning:** In multi-page apps where subsequent pages depend on a selection made in the first page (e.g., "Select Case"), navigating ahead without a selection leads to confusing empty lists and error notifications. Users need explicit guidance.
**Action:** Implement a persistent "No Selection" empty state that overlays or replaces the dependent page content, clearly explaining why the view is unavailable and providing a direct action button to fix it.
## 2026-02-12 - [Residual Regex Coverage for Diverse Solvers]
**Learning:** A "standard" residuals plot that only captures `U`, `p`, and `k-epsilon` variables will appear empty and "broken" for simulations that solve for enthalpy (`h`), temperature (`T`), or other model-specific fields. UX is improved when the system proactively captures a wide range of common solver outputs.
**Action:** Regularly audit simulation logs and expand the residuals regex to cover emerging fields (e.g., `rho`, `p_rgh`, `h`, `T`). Ensure the backend dictionary supports these fields to avoid "Missing Data" states on legitimate runs.

## 2026-02-12 - [Frontend Field Mapping Sync]
**Learning:** Backend expansion of parsed data (e.g., adding more residual fields) is ineffective if the frontend visualization logic uses a hardcoded whitelist of fields. This creates a "silent data loss" scenario where the API returns data that the UI simply ignores.
**Action:** When expanding backend data structures, always audit the corresponding frontend interfaces and rendering loops. Use dynamic keys where possible, or ensure whitelists are synchronized across the stack.


## 2026-05-24 - [Keyboard Navigation Shortcuts]
**Learning:** `accesskey` attribute provides native keyboard shortcuts without custom JS listeners, but discoverability relies on tooltips or visual hints. Using standard modifier keys (Alt+Shift+Key) is browser-dependent, so "AccessKey" in tooltip is a neutral hint.
**Action:** Use `accesskey` for primary navigation elements to empower power users and improve accessibility.

## 2026-05-25 - [Inconsistent Focus States]
**Learning:** `focus:outline-none` removes the default browser focus ring, rendering elements invisible to keyboard users if not replaced with a custom focus style (e.g., `focus:ring`). Several interactive elements were using this anti-pattern.
**Action:** Audit all uses of `focus:outline-none` and ensure they are immediately followed by `focus:ring-*` or equivalent visual indicators to maintain accessibility.

## $(date +%Y-%m-%d) - Standardize Form Field Focus States
**Learning:** In a heavily utility-styled UI, form fields and interactive components (like select menus and inputs) often lack the default browser focus ring, rendering keyboard navigation nearly invisible for users. Applying standard Tailwind focus states makes a dramatic impact on accessibility.
**Action:** Consistently apply `focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500` (or `focus:ring-2 focus:ring-cyan-500` for checkboxes) to all form inputs, and test via keyboard tabbing to ensure the active element is always obvious.
