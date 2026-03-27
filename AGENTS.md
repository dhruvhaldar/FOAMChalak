# Agent Learnings & Journal

This document consolidates key learnings from the Sentinel (Security), Bolt (Performance), and Palette (UI/UX) personas, along with recent architectural discoveries.

## 🏗️ Architectural Decisions
### 2026-01-24 - [Flask-Only Architecture]
**Decision:** The project strictly enforces a Flask-only architecture (`python -m app`). Hybrid setups involving Uvicorn/FastAPI (`main.py`) are explicitly banned to maintain simplicity and compatibility. All real-time features must use polling or Flask-compatible streaming rather than WebSockets.

### 2026-01-24 - [Streaming Response Buffering]
**Problem:** `Flask-Compress` middleware automatically buffers and compresses streaming responses (e.g., `text/html`), causing real-time logs to appear in a single chunk at the end of execution.
**Decision:** Streaming endpoints must use `stream_with_context` from Flask and set an uncompressed MIME type (e.g., `text/plain`) or explicitly bypass compression to ensure immediate flushing of data chunks.

### 2026-01-24 - [Stateful Cache Invalidation]
**Problem:** Global in-memory caches for expensive parsers (like OpenFOAM fields) persist across "reset" actions (e.g., re-importing a tutorial), leading to stale data visualization.
### 2026-01-24 - [Frontend Initialization Race Conditions]
**Problem:** Single Page Applications (SPAs) often initialize page logic (e.g., polling) effectively in parallel with state restoration (reading `localStorage`), leading to race conditions where components act on default/stale state before the saved state is applied.
**Decision:** Frontend initialization must strictly serialize state restoration *before* triggering any business logic or network calls. Using explicit ordering in a central `init` function is safer than relying on event listener registration order.

### 2026-03-27 - [Robust Case Path Resolution]
**Problem:** The `run_case` endpoint naively compared the host directory name to the tutorial name to decide volume mounting strategies. This failed if the host folder name didn't match the tutorial leaf exactly, or if the user refreshed the page and the frontend's path state was reset.
**Decision:** Command execution must use structural validation (e.g., checking for the existence of `system/controlDict` or the `constant` folder) rather than string matching to identify an OpenFOAM case directory. Internal shell logging (`$(pwd)`, `ls -F`) should be injected into container commands to provide immediate diagnostic context for volume mount failures.

## 🛡️ Sentinel's Security Journal

### 2026-03-01 - [Path Leakage in Docker Exceptions]
**Vulnerability:** The `sanitize_error` function in `backend/utils.py` explicitly allowed `DockerException` messages to pass through raw for debugging purposes. However, these messages often contain absolute paths (e.g., "Bind mount failed: '/absolute/path/on/server' does not exist"), leaking internal server file structure to the user via API responses.
**Learning:** Exception messages from third-party libraries (like `docker-py`) are not safe for public consumption. They prioritize developer context over security and often include environment-specific details. "Debuggability" should not compromise information security in production-like environments.
**Prevention:** I modified `sanitize_error` to apply regex-based redaction on `DockerException` messages. It now detects and replaces quoted absolute paths (both Unix and Windows style) with `[REDACTED_PATH]`, preserving the error context while hiding sensitive filesystem details.

### 2026-01-24 - [Content Security Policy Header Conflicts]
**Vulnerability:** Defining CSP headers in multiple places (e.g., separate `after_request` callbacks) caused the browser to enforce the "intersection" of policies, effectively defaulting to the most restrictive one. A legacy `add_security_headers` function was overwriting a newer, more permissive `set_security_headers`, blocking `frame-src` for the Trame visualizer.
**Learning:** Security headers should be centralized. "Stacking" them does not merge permissions; it typically restricts them further.
**Prevention:** Removed redundant header injection functions and consolidated all CSP rules into a single `set_security_headers` callback in `app.py`.

### 2026-08-20 - [TOCTOU Symlink Vulnerability in Log Processing]
**Vulnerability:** While explicit `is_symlink()` checks were added previously, the `monitor_foamrun_log` function in `app.py` and `get_residuals_from_log` in `backend/plots/realtime_plots.py` were still vulnerable to Time-of-Check Time-of-Use (TOCTOU) race conditions. An attacker could replace the log file with a symlink between the check (`is_symlink`) and the use (`open`), bypassing the check and reading sensitive files.
**Learning:** Checking a file's properties before opening it is insecure if the file system state can change in between (TOCTOU). Security checks must be atomic with the operation.
**Prevention:** Refactored file operations to use `os.open(path, os.O_RDONLY | os.O_NOFOLLOW)`. This atomically opens the file only if it is NOT a symlink, raising an `OSError` (ELOOP) otherwise. This eliminates the race window entirely. Also removed unsafe reliance on `known_stat` for file identity in `get_residuals_from_log`.

### 2026-07-28 - [Reflected XSS in Exception Handling]
**Vulnerability:** The `run_case` endpoint in `app.py` caught exceptions during Docker container execution and yielded the error message back to the client as HTML. The helper function `sanitize_error` (intended to prevent information leakage) returned the string representation of `ValueError` and `DockerException` without escaping. If an attacker could trigger an error message containing malicious HTML (e.g., via a crafted Docker error or path), this payload would be rendered by the browser, leading to Reflected Cross-Site Scripting (XSS).
**Learning:** "Sanitization" functions that only filter sensitive data types but return raw strings are dangerous when used in HTML contexts. Security helpers must be context-aware (e.g., `escape` for HTML) or the caller must explicitly handle encoding. Implicit trust in "sanitized" strings can lead to injection vulnerabilities.
**Prevention:** I modified the exception handler in `run_case` to explicitly wrap the output of `sanitize_error(e)` with `markupsafe.escape()`. This ensures that even if the error message contains special characters, they are treated as text, not markup. Verified with a regression test `tests/security/test_xss_run_case.py`.

### 2026-06-17 - [Centralized Command Validation]
**Vulnerability:** The `is_safe_command` validation logic was defined only in `app.py`, leaving backend components like `MeshingRunner` (which executes shell commands) unprotected if called from other contexts. While `MeshingRunner` used positional arguments (preventing some injection), it still allowed arbitrary commands (like `rm -rf /`) without any validation.
**Learning:** Security validation functions must be reusable and applied at the execution point (Defense in Depth), not just at the API boundary. This ensures that internal components remain secure even if the API layer changes or is bypassed.
**Prevention:** Refactored `is_safe_command` to `backend/utils.py` and applied it in `MeshingRunner.run_meshing_command`. This enforces validation (blocking `..`, `;`, `&`, etc.) directly in the runner, preventing path traversal and shell metacharacters in the command execution.

### 2026-06-16 - [CORS and WebSocket Origin Validation]
**Vulnerability:** The FastAPI application (`main.py`) was configured with `allow_origins=["*"]`, allowing any website to access the API via CORS. Additionally, the WebSocket endpoint `/ws/data` did not validate the `Origin` header, making it vulnerable to Cross-Site WebSocket Hijacking (CSWSH).
**Learning:** `allow_origins=["*"]` is extremely dangerous even for local tools, as it allows drive-by attacks from malicious websites. WebSockets do not automatically enforce Same-Origin Policy and require explicit Origin validation during the handshake.
**Prevention:** I restricted `allow_origins` to `["http://localhost:5000", "http://127.0.0.1:5000"]` and implemented a manual Origin check in the WebSocket endpoint to reject untrusted connections.

### 2026-06-15 - [Symlink Attack in Log Monitoring]
**Vulnerability:** The `monitor_foamrun_log` function in `app.py` and `get_residuals_from_log` in `backend/plots/realtime_plots.py` naively followed symbolic links when processing `log.foamRun` files. This allowed an attacker (or a compromised container) to create a symlink pointing to sensitive host files (e.g., `/etc/passwd`), which the application would then copy or parse, leading to arbitrary file read.
**Learning:** File operations on shared volumes (host <-> container) must treat all files as untrusted, even if they are expected to be generated by a specific tool. Python's standard file operations follow symlinks by default, which is a dangerous default in this context.
**Prevention:** I added explicit checks using `pathlib.Path.is_symlink()` and `os.path.islink()` before opening or copying any log files. This ensures that the application only processes regular files and rejects any symbolic links, mitigating the risk of path traversal via symlinks.

### 2026-05-15 - [Windows Path Handling in Case Root Validation]
**Vulnerability:** The `set_case` endpoint utilized a hardcoded list of forbidden prefixes (e.g., `/etc`, `/bin`) to prevent users from setting the workspace root to system directories. However, this list only contained POSIX paths. On Windows, a user could set the case root to `C:\Windows`, bypassing the check entirely as the string matching logic did not account for drive letters or Windows path separators.
**Learning:** Security controls that rely on path validation must be platform-aware. Hardcoding OS-specific paths (like POSIX-only lists) creates blind spots in cross-platform applications.
**Prevention:** Introduced `is_safe_case_root` helper function in `app.py` that detects the operating system via `platform.system()`. On Windows, it now explicitly checks against drive roots (e.g., `C:\`) and common system directories (`C:\Windows`, `C:\Program Files`), ensuring robust protection across both Linux and Windows environments.

### 2026-03-01 - [Secure Shell Command Construction in Meshing Runner]
**Vulnerability:** The `MeshingRunner` constructed shell commands by interpolating the `command` variable directly into a `bash -c '...'` string. While `app.py` restricted the input to a whitelist, the library code itself was vulnerable to shell injection if reused with unsafe input (e.g., `blockMesh; echo INJECTED`).
**Learning:** String interpolation for shell commands is inherently dangerous, even with surrounding quotes, as injection can escape the quotes or occur if the variable itself contains control characters.
**Prevention:** I modified `MeshingRunner` to use the `list` format for `docker_client.containers.run`, passing arguments safely to `bash` via positional parameters (`source "$1" && cd "$2" && $3`). This ensures that the command is treated as a single argument by the shell and not parsed for control operators, preventing injection while still allowing path handling.

### 2026-02-12 - [Insecure Default Network Binding]
**Vulnerability:** The Flask application was configured to listen on `0.0.0.0` by default if the `FLASK_HOST` environment variable was not set. This exposed the application to all network interfaces, potentially allowing unauthorized access from other devices on the same network, which is risky for a tool that executes Docker commands.
**Learning:** Default configurations should always favor security ("secure by default"). Binding to `0.0.0.0` is convenient for deployment but dangerous for local development tools unless explicitly intended.
**Prevention:** Changed the default host in `app.py` to `127.0.0.1` (localhost). This ensures the application is only accessible from the local machine by default, reducing the attack surface. Users can still override this via the `FLASK_HOST` environment variable if needed.

### 2026-01-11 - [Brace Expansion in Command Validation]
**Vulnerability:** The `is_safe_command` blacklist validation in `app.py` blocked many shell metacharacters but missed brace expansion (`{` and `}`). While not directly leading to Remote Code Execution (RCE) in this specific app due to other structural constraints, brace expansion can be used to generate arguments or create multiple files (e.g., `touch {a,b}`), which might bypass certain logic or cause unexpected behavior in shell scripts constructed via string concatenation.
**Learning:** Blacklisting is inherently fragile because shell syntax is rich and constantly evolving. Brace expansion is a less common but valid vector for manipulating command arguments.
**Prevention:** Added `{` and `}` to the `dangerous_chars` list in `is_safe_command`. Ideally, applications should avoid constructing shell commands from user input entirely, but when necessary, strict whitelisting (which was partially present in `run_case` logic but not `is_safe_command` itself) is superior to blacklisting.

### 2024-05-24 - [Path Traversal in Geometry and Meshing Endpoints]
**Vulnerability:** Several API endpoints (`/api/geometry/list`, `/api/geometry/upload`, `/api/geometry/delete`, `/api/meshing/blockMesh/config`, `/api/meshing/snappyHexMesh/config`, `/api/meshing/run`) accepted a `caseName` parameter and constructed file paths using `Path(CASE_ROOT) / case_name` without validation. This allowed path traversal (e.g., `caseName=../secret`) to access or modify files outside the intended case root directory.
**Learning:** Relying on `request.form.get()` or `request.get_json()` input directly for path construction is dangerous. Even "creation" logic can be a vector for traversal if it involves creating directories at user-controlled paths.
**Prevention:** Applied `validate_safe_path(CASE_ROOT, case_name)` to all affected endpoints in `app.py`. This function resolves the path and explicitly checks if it `is_relative_to(CASE_ROOT)`. Future endpoints handling file paths must use this validation utility before any filesystem operations.

### 2024-05-23 - [Path Traversal in Case Creation]
**Vulnerability:** The `/api/case/create` endpoint accepted a `caseName` parameter and used it to construct a path `Path(CASE_ROOT) / case_name` which was then passed to `CaseManager.create_case_structure`. The `CaseManager` resolved the path but did not check if it was within `CASE_ROOT`. This allowed users to create directories (and potentially files like `controlDict`) anywhere on the filesystem where the process had write permissions by using `../` in the case name.
**Learning:** Checking for "safe" paths must happen at the boundary (API endpoint) before business logic is invoked. Even "creation" logic can be a vector for traversal if it involves creating directories at user-controlled paths.
**Prevention:** Applied `validate_safe_path(CASE_ROOT, case_name)` in `api_create_case` before passing the path to the manager. This ensures the target path is strictly within the allowed `CASE_ROOT`.

### 2024-05-23 - [Path Traversal in Mesh Visualizer]
**Vulnerability:** The endpoints `/api/load_mesh`, `/api/mesh_screenshot`, and `/api/mesh_interactive` accepted a `file_path` parameter from the user and passed it directly to `pyvista.read` or `mesh_visualizer.load_mesh` without validation. This allowed users to potentially read arbitrary files on the server (if they were valid mesh formats or if `pyvista` supported them) or cause denial of service by loading non-mesh files.
**Learning:** Even if a library like `pyvista` seems specialized for 3D data, it performs file I/O and thus requires strict path validation when dealing with user-supplied paths. The assumption that "only mesh files will load" is insufficient protection against path traversal.
**Prevention:** Always validate user-supplied file paths using a strict "allow-list" approach or by ensuring the path resolves to a subdirectory of a trusted root (using `pathlib.Path.is_relative_to` after `resolve()`) before passing it to any file opening function. I applied `validate_safe_path(CASE_ROOT, file_path)` to all affected endpoints.

---

## ⚡ Bolt's Performance Journal

### 2026-01-24 - [Server Port Race Conditions]
**Issue:**  Identifying a successful start of a child process server (Trame) by just reading its assigned port from a queue was insufficient. The client (browser) was receiving the URL `http://127.0.0.1:port` and attempting to connect *before* the server had actually bound the socket, resulting in `Connection Refused` errors.
**Learning:** Process startup and socket binding are asynchronous. A "port number" being available does not mean the "listener" is ready.
**Action:** Implemented a robust `_wait_for_port` mechanism in `isosurface.py` that actively probes the port with `socket.create_connection` (with retries) before returning the URL to the client.

### 2026-05-15 - [Bytes Search Performance]
**Learning:** In Python, searching for a substring in bytes (`b"sub" in data`) is ~10-12x slower than the string equivalent (`"sub" in data`). For high-throughput parsing (like large log files), using `re.search` on bytes directly is significantly faster than using `in` as a pre-check, and also avoids the overhead of `decode()`.
**Action:** When parsing large binary or ASCII-compatible files, prefer using compiled bytes-regex (`re.compile(rb"...")`) and skip the `in` operator pre-check if the data is `bytes`.

### 2026-03-10 - [Probabilistic Cache Cleanup]
**Learning:** Frequent file-based cache cleanup involving `os.scandir()` and `stat()` calls on all files (O(N)) adds significant latency (e.g., ~12ms per call for 2000 files) to the hot path of request handling.
**Action:** Implemented probabilistic cleanup (running only 10% of the time). This amortizes the cost of maintenance, reducing average overhead by 90% (to ~1.3ms) while maintaining approximate cache limits.

### 2026-01-19 - [Mesh Screenshot Caching]
**Learning:** PyVista rendering for screenshots is CPU-intensive (~0.2s for simple meshes). Repeated requests for the same visualization parameters are common.
**Action:** Implemented an in-memory LRU cache keyed by file mtime and visualization parameters. Safely handles unhashable inputs (lists) by converting to tuples. Speedup > 100x.

### 2025-02-05 - [Docker Execution Consolidation]
**Learning:** Running `client.containers.run` incurs significant overhead (often 500ms-1s) for container startup and shutdown. When multiple commands need to be run sequentially (e.g., sourcing environment variables then running a command), executing them in separate containers multiplies this latency.
**Action:** Combine sequential shell commands into a single execution using `bash -c 'cmd1 && cmd2'` whenever possible to pay the startup cost only once. This is especially critical for frequently called endpoints or initialization routines.

### 2025-12-14 - [Append-Only Cache Optimization]
**Learning:** For time-series data caches that grow monotonically (like simulation logs), re-copying the entire data structure on every update is O(N²).
**Action:** Detect the "append-only" case (where the new state is a superset of the old state) and use a shallow copy of the container + in-place append for the internal lists. This reduces complexity to O(N) and significantly speeds up polling for long-running processes.

### 2025-12-14 - [ETag Optimization for Polling]
**Learning:** Polling endpoints (like realtime plots) often check a "trigger" file (e.g., log file) to see if update is needed. If the trigger updates frequently (e.g., every log line) but the expensive payload (e.g., field data) updates rarely, the server re-processes data unnecessarily.
**Action:** Implement a secondary check using ETag based on the actual data source mtime (e.g., latest time directory) to return 304 Not Modified even if the primary trigger (log) has changed. This saves significant CPU/IO during "compute-only" phases of simulation.

### 2025-12-14 - [Directory Iteration Optimization]
**Learning:** For directories with many entries, `os.scandir()` is significantly faster than `pathlib.Path.iterdir()` because it avoids the overhead of creating a `Path` object for every entry and often provides file type information (`is_dir`, `is_file`) directly from the directory entry without extra `stat()` calls.
**Action:** Prefer `os.scandir()` over `pathlib` for performance-critical directory traversal loops, especially when filtering by file type.

---

## 🎨 Palette's UI/UX Journal

### 2026-01-26 - [Protecting Reproducible Data]
**Learning:** Even "view-only" data like simulation logs, which are expensive to reproduce (requiring re-running a simulation), should be treated as destructive deletions when cleared. Users often treat the log as a persistent record of the run.
**Action:** Apply confirmation patterns not just to file deletions, but also to clearing significant UI state/logs that represent long-running processes.

### 2026-01-21 - [Keyboard Shortcuts for Selection Inputs]
**Learning:** Users expect "Enter" to trigger the primary action associated with an input or selection, even if it's not in a `<form>`. Double-clicking items in a listbox is a standard pattern for "Select & Action" on desktop interfaces.
**Action:** Always bind "Enter" on non-form inputs/selects to their primary action button, and "Double Click" on listbox elements (`size > 1`) to trigger the view/select action.

### 2026-01-20 - [Modal Focus Trapping]
**Learning:** Custom modals implemented as appended DOM elements often miss keyboard focus management, allowing users to Tab out of the modal into the background page, which violates accessibility standards and confuses screen reader users.
**Action:** Always implement a focus trap loop (handling Tab and Shift+Tab) within custom modals and restore focus to the previously active element upon closure.

### 2026-01-15 - [Missing Loading States on Async Actions]
**Learning:** Users lack feedback during blocking async operations like generating mesh configuration, leading to uncertainty if the action was registered.
**Action:** Always wrap async fetch calls in a try/finally block that toggles a loading state (spinner/disabled) on the triggering button.

### 2025-10-27 - [Styling Native Details]
**Learning:** Native `<details>` elements are extremely hard to style consistently across browsers, especially the `marker` (triangle).
**Action:** Hide the default marker with `list-none` and `[&::-webkit-details-marker]:hidden`, then use a flex container with a custom SVG icon that rotates using `group-open:rotate-180` for a clean, animated accordion.

### 2025-10-26 - [File Input Accessibility Gaps]
**Learning:** File inputs hidden inside custom UI widgets (like accordions or custom uploaders) often lose their semantic labeling, leaving screen reader users guessing what the "Choose File" button is for.
**Action:** Always verify that `<input type="file">` elements have either a visible `<label>` via `for/id` or an `aria-label` if the UI implies the label contextually.
