## 2024-05-23 - Path Traversal in Mesh Visualizer
**Vulnerability:** The endpoints `/api/load_mesh`, `/api/mesh_screenshot`, and `/api/mesh_interactive` accepted a `file_path` parameter from the user and passed it directly to `pyvista.read` or `mesh_visualizer.load_mesh` without validation. This allowed users to potentially read arbitrary files on the server (if they were valid mesh formats or if `pyvista` supported them) or cause denial of service by loading non-mesh files.
**Learning:** Even if a library like `pyvista` seems specialized for 3D data, it performs file I/O and thus requires strict path validation when dealing with user-supplied paths. The assumption that "only mesh files will load" is insufficient protection against path traversal.
**Prevention:** Always validate user-supplied file paths using a strict "allow-list" approach or by ensuring the path resolves to a subdirectory of a trusted root (using `pathlib.Path.is_relative_to` after `resolve()`) before passing it to any file opening function. I applied `validate_safe_path(CASE_ROOT, file_path)` to all affected endpoints.

## 2024-05-23 - Path Traversal in Case Creation
**Vulnerability:** The `/api/case/create` endpoint accepted a `caseName` parameter and used it to construct a path `Path(CASE_ROOT) / case_name` which was then passed to `CaseManager.create_case_structure`. The `CaseManager` resolved the path but did not check if it was within `CASE_ROOT`. This allowed users to create directories (and potentially files like `controlDict`) anywhere on the filesystem where the process had write permissions by using `../` in the case name.
**Learning:** Checking for "safe" paths must happen at the boundary (API endpoint) before business logic is invoked. Even "creation" logic can be a vector for traversal if it involves creating directories at user-controlled paths.
**Prevention:** Applied `validate_safe_path(CASE_ROOT, case_name)` in `api_create_case` before passing the path to the manager. This ensures the target path is strictly within the allowed `CASE_ROOT`.

## 2024-05-24 - Path Traversal in Geometry and Meshing Endpoints
**Vulnerability:** Several API endpoints (`/api/geometry/list`, `/api/geometry/upload`, `/api/geometry/delete`, `/api/meshing/blockMesh/config`, `/api/meshing/snappyHexMesh/config`, `/api/meshing/run`) accepted a `caseName` parameter and constructed file paths using `Path(CASE_ROOT) / case_name` without validation. This allowed path traversal (e.g., `caseName=../secret`) to access or modify files outside the intended case root directory.
**Learning:** Relying on `request.form.get()` or `request.get_json()` input directly for path construction is dangerous. Even "creation" logic can be a vector for traversal if it involves creating directories at user-controlled paths.
**Prevention:** Applied `validate_safe_path(CASE_ROOT, case_name)` to all affected endpoints in `app.py`. This function resolves the path and explicitly checks if it `is_relative_to(CASE_ROOT)`. Future endpoints handling file paths must use this validation utility before any filesystem operations.

## 2026-01-11 - Brace Expansion in Command Validation
**Vulnerability:** The `is_safe_command` blacklist validation in `app.py` blocked many shell metacharacters but missed brace expansion (`{` and `}`). While not directly leading to Remote Code Execution (RCE) in this specific app due to other structural constraints, brace expansion can be used to generate arguments or create multiple files (e.g., `touch {a,b}`), which might bypass certain logic or cause unexpected behavior in shell scripts constructed via string concatenation.
**Learning:** Blacklisting is inherently fragile because shell syntax is rich and constantly evolving. Brace expansion is a less common but valid vector for manipulating command arguments.
**Prevention:** Added `{` and `}` to the `dangerous_chars` list in `is_safe_command`. Ideally, applications should avoid constructing shell commands from user input entirely, but when necessary, strict whitelisting (which was partially present in `run_case` logic but not `is_safe_command` itself) is superior to blacklisting.

## 2026-02-12 - Insecure Default Network Binding
**Vulnerability:** The Flask application was configured to listen on `0.0.0.0` by default if the `FLASK_HOST` environment variable was not set. This exposed the application to all network interfaces, potentially allowing unauthorized access from other devices on the same network, which is risky for a tool that executes Docker commands.
**Learning:** Default configurations should always favor security ("secure by default"). Binding to `0.0.0.0` is convenient for deployment but dangerous for local development tools unless explicitly intended.
**Prevention:** Changed the default host in `app.py` to `127.0.0.1` (localhost). This ensures the application is only accessible from the local machine by default, reducing the attack surface. Users can still override this via the `FLASK_HOST` environment variable if needed.

## 2026-03-01 - Secure Shell Command Construction in Meshing Runner
**Vulnerability:** The `MeshingRunner` constructed shell commands by interpolating the `command` variable directly into a `bash -c '...'` string. While `app.py` restricted the input to a whitelist, the library code itself was vulnerable to shell injection if reused with unsafe input (e.g., `blockMesh; echo INJECTED`).
**Learning:** String interpolation for shell commands is inherently dangerous, even with surrounding quotes, as injection can escape the quotes or occur if the variable itself contains control characters.
**Prevention:** I modified `MeshingRunner` to use the `list` format for `docker_client.containers.run`, passing arguments safely to `bash` via positional parameters (`source "$1" && cd "$2" && $3`). This ensures that the command is treated as a single argument by the shell and not parsed for control operators, preventing injection while still allowing path handling.

## 2026-05-15 - Windows Path Handling in Case Root Validation
**Vulnerability:** The `set_case` endpoint utilized a hardcoded list of forbidden prefixes (e.g., `/etc`, `/bin`) to prevent users from setting the workspace root to system directories. However, this list only contained POSIX paths. On Windows, a user could set the case root to `C:\Windows`, bypassing the check entirely as the string matching logic did not account for drive letters or Windows path separators.
**Learning:** Security controls that rely on path validation must be platform-aware. Hardcoding OS-specific paths (like POSIX-only lists) creates blind spots in cross-platform applications.
**Prevention:** Introduced `is_safe_case_root` helper function in `app.py` that detects the operating system via `platform.system()`. On Windows, it now explicitly checks against drive roots (e.g., `C:\`) and common system directories (`C:\Windows`, `C:\Program Files`), ensuring robust protection across both Linux and Windows environments.

## 2026-06-15 - Symlink Attack in Log Monitoring
**Vulnerability:** The `monitor_foamrun_log` function in `app.py` and `get_residuals_from_log` in `backend/plots/realtime_plots.py` naively followed symbolic links when processing `log.foamRun` files. This allowed an attacker (or a compromised container) to create a symlink pointing to sensitive host files (e.g., `/etc/passwd`), which the application would then copy or parse, leading to arbitrary file read.
**Learning:** File operations on shared volumes (host <-> container) must treat all files as untrusted, even if they are expected to be generated by a specific tool. Python's standard file operations follow symlinks by default, which is a dangerous default in this context.
**Prevention:** I added explicit checks using `pathlib.Path.is_symlink()` and `os.path.islink()` before opening or copying any log files. This ensures that the application only processes regular files and rejects any symbolic links, mitigating the risk of path traversal via symlinks.

## 2026-06-16 - CORS and WebSocket Origin Validation
**Vulnerability:** The FastAPI application (`main.py`) was configured with `allow_origins=["*"]`, allowing any website to access the API via CORS. Additionally, the WebSocket endpoint `/ws/data` did not validate the `Origin` header, making it vulnerable to Cross-Site WebSocket Hijacking (CSWSH).
**Learning:** `allow_origins=["*"]` is extremely dangerous even for local tools, as it allows drive-by attacks from malicious websites. WebSockets do not automatically enforce Same-Origin Policy and require explicit Origin validation during the handshake.
**Prevention:** I restricted `allow_origins` to `["http://localhost:5000", "http://127.0.0.1:5000"]` and implemented a manual Origin check in the WebSocket endpoint to reject untrusted connections.

## 2026-06-17 - Centralized Command Validation
**Vulnerability:** The `is_safe_command` validation logic was defined only in `app.py`, leaving backend components like `MeshingRunner` (which executes shell commands) unprotected if called from other contexts. While `MeshingRunner` used positional arguments (preventing some injection), it still allowed arbitrary commands (like `rm -rf /`) without any validation.
**Learning:** Security validation functions must be reusable and applied at the execution point (Defense in Depth), not just at the API boundary. This ensures that internal components remain secure even if the API layer changes or is bypassed.
**Prevention:** Refactored `is_safe_command` to `backend/utils.py` and applied it in `MeshingRunner.run_meshing_command`. This enforces validation (blocking `..`, `;`, `&`, etc.) directly in the runner, preventing path traversal and shell metacharacters in the command execution.

## 2026-07-28 - Reflected XSS in Exception Handling
**Vulnerability:** The `run_case` endpoint in `app.py` caught exceptions during Docker container execution and yielded the error message back to the client as HTML. The helper function `sanitize_error` (intended to prevent information leakage) returned the string representation of `ValueError` and `DockerException` without escaping. If an attacker could trigger an error message containing malicious HTML (e.g., via a crafted Docker error or path), this payload would be rendered by the browser, leading to Reflected Cross-Site Scripting (XSS).
**Learning:** "Sanitization" functions that only filter sensitive data types but return raw strings are dangerous when used in HTML contexts. Security helpers must be context-aware (e.g., `escape` for HTML) or the caller must explicitly handle encoding. Implicit trust in "sanitized" strings can lead to injection vulnerabilities.
**Prevention:** I modified the exception handler in `run_case` to explicitly wrap the output of `sanitize_error(e)` with `markupsafe.escape()`. This ensures that even if the error message contains special characters, they are treated as text, not markup. Verified with a regression test `tests/security/test_xss_run_case.py`.

## 2026-08-20 - TOCTOU Symlink Vulnerability in Log Processing
**Vulnerability:** While explicit `is_symlink()` checks were added previously, the `monitor_foamrun_log` function in `app.py` and `get_residuals_from_log` in `backend/plots/realtime_plots.py` were still vulnerable to Time-of-Check Time-of-Use (TOCTOU) race conditions. An attacker could replace the log file with a symlink between the check (`is_symlink`) and the use (`open`), bypassing the check and reading sensitive files.
**Learning:** Checking a file's properties before opening it is insecure if the file system state can change in between (TOCTOU). Security checks must be atomic with the operation.
**Prevention:** Refactored file operations to use `os.open(path, os.O_RDONLY | os.O_NOFOLLOW)`. This atomically opens the file only if it is NOT a symlink, raising an `OSError` (ELOOP) otherwise. This eliminates the race window entirely. Also removed unsafe reliance on `known_stat` for file identity in `get_residuals_from_log`.

## 2026-01-24 - [Content Security Policy Header Conflicts]
**Vulnerability:** Defining CSP headers in multiple places (e.g., separate `after_request` callbacks) caused the browser to enforce the "intersection" of policies, effectively defaulting to the most restrictive one. A legacy `add_security_headers` function was overwriting a newer, more permissive `set_security_headers`, blocking `frame-src` for the Trame visualizer.
**Learning:** Security headers should be centralized. "Stacking" them does not merge permissions; it typically restricts them further.
**Prevention:** Removed redundant header injection functions and consolidated all CSP rules into a single `set_security_headers` callback in `app.py`.

## 2026-01-24 - [Attack Surface Reduction via Single Server]
**Vulnerability:** Running a hybrid setup with both Flask and Uvicorn/FastAPI exposes additional ports and protocol handlers (ASGI vs WSGI), increasing the attack surface and potential configuration drift (e.g., conflicting CORS policies).
**Learning:** Simplifying the stack reduces the likelihood of security misconfigurations.
**Prevention:** Enforced a strict Flask-only architecture (`python -m app`), removing the concurrent WebSocket server. This ensures a single point of entry for all traffic, allowing centralized enforcement of security headers, rate limiting, and authentication logic.

## 2026-02-12 - Command Injection Risk via Globbing/Brace Expansion
**Vulnerability:** The `is_safe_command` blacklist validation in `backend/utils.py` blocked many shell metacharacters but allowed globbing (`*`, `?`, `[`, `]`), brace expansion (`{`, `}`), and other special characters (`~`, `!`). While current usage patterns in `run_case` might mitigate this via other means, `is_safe_command` is a reusable security function and its permissive nature poses a risk if used in contexts where argument splitting allows these characters to be interpreted by the shell.
**Learning:** Blacklisting is difficult to get right. Standard shell metacharacters go beyond just control operators (`;`, `&`, `|`). Globbing and expansion characters can lead to unintended file operations or information disclosure.
**Prevention:** Updated `backend/utils.py` to include `*`, `?`, `[`, `]`, `~`, `!`, `{`, `}` in the `dangerous_chars` list, hardening the validation logic against these injection vectors.

## 2026-03-01 - Path Leakage in Docker Exceptions
**Vulnerability:** The `sanitize_error` function in `backend/utils.py` explicitly allowed `DockerException` messages to pass through raw for debugging purposes. However, these messages often contain absolute paths (e.g., "Bind mount failed: '/absolute/path/on/server' does not exist"), leaking internal server file structure to the user via API responses.
**Learning:** Exception messages from third-party libraries (like `docker-py`) are not safe for public consumption. They prioritize developer context over security and often include environment-specific details. "Debuggability" should not compromise information security in production-like environments.
**Prevention:** I modified `sanitize_error` to apply regex-based redaction on `DockerException` messages. It now detects and replaces quoted absolute paths (both Unix and Windows style) with `[REDACTED_PATH]`, preserving the error context while hiding sensitive filesystem details.
## 2025-02-18 - Docker Error Path Leakage
**Vulnerability:** `sanitize_error` regex only handled single-quoted paths, leaking sensitive paths in double-quoted Docker errors (JSON) or unquoted messages (e.g. `bind: /host/path`).
**Learning:** Regex-based sanitization must account for all variations of quoting and formatting produced by the underlying system (Docker API vs CLI).
**Prevention:** Use comprehensive regexes that cover different quote styles and unquoted patterns, while carefully excluding false positives like URLs.

## 2026-05-25 - [Insecure CSRF Cookie Attribute]
**Vulnerability:** The CSRF token cookie was explicitly set with `secure=False` in `app.py`. This exposed the sensitive CSRF token to interception over unencrypted HTTP connections, even if the user accessed the application via HTTPS (e.g. in mixed content scenarios or if the network traffic was monitored).
**Learning:** Hardcoding security flags like `secure=False` to support local development creates a persistent vulnerability in production environments. Security settings should adapt to the deployment context.
**Prevention:** Modified `app.py` to set the `secure` flag dynamically using `secure=request.is_secure`. This ensures the cookie is protected in HTTPS environments while maintaining compatibility with local HTTP development.
## 2026-02-12 - [Defensive Parsing of External Logs]
**Vulnerability:** Log parsing logic can be a vector for minor DoS if it improperly handles malformed or extremely large lines, or if it trusts the format enough to skip security checks.
**Learning:** Robustness and security go hand-in-hand. When adding new parsing features (like handling the `s` suffix in `Time` lines), it is critical to maintain the established security boundaries, such as the atomic `os.open(O_NOFOLLOW)` check, to ensure that convenience does not re-introduce symlink vulnerabilities.
**Prevention:** Verified that the improved parsing in `get_residuals_from_log` continues to utilize the atomic `O_NOFOLLOW` pattern, ensuring that the fix for "empty plots" remains secure against symlink attacks.
