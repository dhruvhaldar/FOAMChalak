## 2025-02-23 - Avoiding Redundant Path.exists() Checks
**Learning:** Python backend endpoints frequently incur a double system call overhead when using "Look Before You Leap" (LBYL) code patterns like `if not path.exists(): return error` immediately followed by `os.stat(path)` or `os.scandir(path)`. This is especially costly for high-frequency polling endpoints.
**Action:** When a file or directory operation is intended immediately after checking its existence, replace the explicit `Path.exists()` check with an "Easier to Ask for Forgiveness than Permission" (EAFP) approach. Wrap the primary operation (`os.stat`, `os.scandir`, etc.) in a `try...except FileNotFoundError` (or `OSError`) block and handle the missing file case within the exception handler. Note that corresponding tests mocking `Path.exists` will need to be updated to mock `os.stat` or similar.

## 2025-02-23 - Git Hygiene for Local Databases
**Learning:** Local database files, such as SQLite `.db` files generated during testing or local development (e.g., `instance/simulation_runs.db`), should never be committed to version control. Doing so causes repository bloat, overrides the local state of other developers, and risks leaking sensitive testing data.
**Action:** Always run `git status` before committing to ensure unintended files are not staged. If auto-generated binaries or databases appear, unstage them (`git reset HEAD <file>`), remove them if necessary, and ensure they are covered by `.gitignore`.

## 2025-03-05 - Pre-compiling regexes for validation functions
**Learning:** Calling `re.match` or `re.search` with string literals directly inside functions causes the Python regex engine to perform internal cache lookups. For frequently called functions, especially validation functions used in multiple endpoints, this overhead accumulates.
**Action:** Extract inline regexes to module-level global variables using `re.compile()`, and call `.match()` or `.search()` on the compiled object. This skips the cache lookup step entirely and offers a ~2x performance speedup.
## 2026-03-01 - [Batch NumPy Percentile Calculations]
**Learning:** Calling `np.percentile` multiple times on a large dataset forces NumPy to independently partition or sort the array for each call, leading to O(k*N) complexity. Providing a list of percentiles allows NumPy to optimize the operation.
**Action:** Group multiple percentile queries into a single `np.percentile(data, [p1, p2, p3...])` call and unpack the result.

## 2025-02-23 - Prevent DOM and DB Overload with Pagination
**Learning:** Returning all simulation history from `SimulationRun.query.all()` caused large network payloads, huge memory usage, and severe performance degradation when iterating over rows and rendering them as DOM elements in the `fetchRunHistory` function. Adding an index to `start_time` accelerates sorting queries but returning thousands of rows without pagination makes the application unresponsive.
**Action:** When querying historical data (such as simulation runs), always enforce pagination or a strict limit (`.limit(limit)`) at the database query level to prevent backend bloat. Simultaneously limit the requested bounds from the frontend (`fetch("/api/runs?limit=50")`) to avoid mapping through immense JSON payloads and generating thousands of DOM nodes, ensuring UI smoothness. Added a DB index to the primary sorting key (`start_time`) to keep response times consistently low as the table grows.

## 2026-03-01 - Optimizing NumPy Vector Magnitude Calculations
**Learning:** `np.linalg.norm(data, axis=1)` is sub-optimal for computing the magnitude of vectors in large arrays (e.g., $N \times 3$ PyVista point data arrays) because it allocates intermediate arrays and performs additional dimensional checks. Using `np.sqrt(np.einsum('ij,ij->i', data, data))` avoids this overhead and achieves an approximate 3x speedup.
**Action:** Replace `np.linalg.norm(data, axis=1)` with `np.sqrt(np.einsum('ij,ij->i', data, data))` for row-wise vector magnitude calculations on large datasets.

## 2026-03-01 - Optimize scalar vector magnitude with math.hypot
**Learning:** While `np.sqrt` and `np.linalg.norm` are great for vectorized array operations, using `np.sqrt(x**2 + y**2 + z**2)` for individual scalar floats introduces significant overhead from the Python-to-C API transitions and manual math operators. Python's built-in `math.hypot(x, y, z)` is written in C specifically for computing Euclidean norms and avoids this overhead, making it ~2.5x faster.
**Action:** When calculating the magnitude or Euclidean norm of a small, fixed number of independent scalar variables (e.g., parsing a 3D vector like `ux, uy, uz`), use `math.hypot(x, y, z)` instead of NumPy functions or manual arithmetic.

## 2026-03-01 - [Avoid Redundant os.path.exists() Checks for File Operations]
**Learning:** Python operations like `os.remove(path)` and `os.path.getsize(path)` frequently incur a double system call overhead when using "Look Before You Leap" (LBYL) code patterns like `if os.path.exists(path): os.remove(path)`. This is especially costly for high-frequency operations or cleanup code.
**Action:** Use an "Easier to Ask for Forgiveness than Permission" (EAFP) approach. Wrap the primary operation (`os.remove`, `os.path.getsize`, etc.) in a `try...except OSError` block and handle the missing file case within the exception handler. Note that corresponding tests mocking `os.path.exists` will need to be updated to mock `os.remove` or similar.
## 2026-03-12 - [Replace path.exists() LBYL with EAFP exceptions for reading cache files]
**Learning:** When retrieving temporary cache files (e.g., HTML cache for PyVista), calling `path.exists()` immediately before `open()` results in two separate `stat` system calls. This LBYL pattern is not performant for heavily cached endpoints.
**Action:** Replaced `if path.exists(): open(...)` with `try: open(...) except FileNotFoundError`.
## 2026-03-13 - Optimize HTML Escaping in Render Loop
**Learning:** For high-frequency JavaScript string processing (e.g., HTML escaping in log rendering ), defining the function inside the loop and chaining `.replace()` calls forces the engine to repeatedly re-allocate the function and traverse the string multiple times, creating O(N) intermediate string allocations and garbage collection thrashing.
**Action:** Extract the escaping function outside the render loop and replace chained `.replace()` calls with a single-pass regular expression (e.g., `/[&<>"']/g`) combined with a dictionary lookup to execute in O(N) time with minimal allocations.
## 2024-05-18 - Optimize HTML Escaping in Render Loop
**Learning:** For high-frequency JavaScript string processing (e.g., HTML escaping in log rendering), defining the function inside the loop and chaining `.replace()` calls forces the engine to repeatedly re-allocate the function and traverse the string multiple times, creating O(N) intermediate string allocations and garbage collection thrashing.
**Action:** Extract the escaping function outside the render loop and replace chained `.replace()` calls with a single-pass regular expression (e.g., `/[&<>"']/g`) combined with a dictionary lookup to execute in O(N) time with minimal allocations.

## 2025-03-14 - Replace path.exists() LBYL with EAFP for file creation
**Learning:** Checking `path.exists()` immediately before opening and writing to a file (LBYL pattern) causes redundant file system calls (`stat` followed by `open`). This is inefficient, especially when generating many default configuration files during initialization.
**Action:** Replace `if not path.exists(): write(...)` checks with an "Easier to Ask for Forgiveness than Permission" (EAFP) approach using `open(path, 'x')` (exclusive creation). Catch and ignore the `FileExistsError`. This reduces file operations by combining the existence check and open operation into a single atomic system call.

## 2025-05-18 - Reuse percentiles for min and max calculations
**Learning:** Calling `np.min` and `np.max` immediately before or after computing `np.percentile` with 0 and 100 percentiles is redundant and causes unnecessary O(N) passes over the array. The 0th and 100th percentiles returned by `np.percentile(data, [0, ..., 100])` are mathematically identical to the min and max.
**Action:** Replace `np.min(data)` and `np.max(data)` calls with the already-computed `p0` and `p100` values from the `np.percentile` tuple unpacking to save redundant array traversals on large arrays.

## 2026-03-22 - Optimize PyVista Data Range Calculation
**Learning:** Extracting a NumPy array from a PyVista `DataSet` (e.g., `self.mesh.point_data[field]`) and calling `np.min()` and `np.max()` on it incurs overhead from moving data into Python and executing two separate O(N) linear scans. Using PyVista's built-in `mesh.get_data_range(field)` leverages VTK's optimized C++ backend to compute the bounds in a single pass without copying data to Python, improving performance.
**Action:** Replace `np.min()` and `np.max()` operations on full PyVista mesh data arrays with `mesh.get_data_range(field)` when calculating data bounds.

## 2026-03-22 - Do Not Replace Fast Linear Scans with Percentiles
**Learning:** Replacing fast, O(N) linear scans like `np.min()` and `np.max()` with `np.percentile(..., [0, 100])` is a significant performance anti-pattern. Percentile calculations require partial sorting algorithms (like Introselect), which have a much higher constant factor and computational overhead than simple min/max traversals.
**Action:** Never use `np.percentile` solely as a replacement for finding minimum and maximum values in an array; stick to `np.min()` and `np.max()` unless other percentiles are explicitly required by the API.
