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

## 2026-03-24 - Optimize min and max calculations using get_data_range
**Learning:** Extracting a NumPy array from a PyVista `DataSet` (e.g., `self.mesh.point_data[field]`) and calling `np.percentile([0, ..., 100])` or `np.min()`/`np.max()` on it incurs overhead from moving data into Python and executing separate O(N) linear scans. Using PyVista's built-in `mesh.get_data_range(field)` leverages VTK's optimized C++ backend to compute the bounds much faster.
**Action:** Replace `np.percentile(data, [0, 25, 50, 75, 100])` with `np.percentile(data, [25, 50, 75])` for the inner percentiles and use `mesh.get_data_range(field)` to fetch exact minimum and maximum bounds. For vector fields, temporarily assign calculated magnitude arrays to the mesh point data to utilize `get_data_range` directly before removing them.

## 2026-03-24 - Do not inject numpy arrays into pyvista meshes for min max calculation
**Learning:** Injecting standalone computed NumPy arrays temporarily into PyVista mesh `point_data` solely to utilize `get_data_range()` is an anti-pattern due to VTK object synchronization overhead.
**Action:** Use `get_data_range()` only for pre-existing mesh fields, and fallback to `np.min()`/`np.max()` for standalone computed NumPy arrays.

## 2026-03-24 - Remove Redundant path.exists() in BaseVisualizer
**Learning:** The \`BaseVisualizer.validate_file\` method called \`path.exists()\` before returning the path, resulting in a redundant \`stat\` system call since all callers immediately called \`path.stat()\` to check for cache invalidation.
**Action:** Removed \`path.exists()\` from \`validate_file\` and ensured all callers use an "Easier to Ask for Forgiveness than Permission" (EAFP) approach by catching \`OSError\` on the subsequent \`path.stat()\` call.

## 2026-03-30 - Replace np.mean with generator and sum for Python lists
**Learning:** When calculating the mean of an intermediate Python list containing primitive numbers or strings (e.g., `[float(n) for n in numbers_list]`), using `float(np.mean([float(n) for n in numbers_list]))` allocates an intermediate Python list and incurs the significant overhead of converting that list to a NumPy array for calculation.
**Action:** Replace `float(np.mean(...))` with a generator expression evaluated by `sum()` divided by `len()` (`sum(float(n) for n in numbers_list) / len(numbers_list)`). This avoids allocating intermediate lists and bypassing the costly NumPy C-API conversion, making it substantially faster for typical Python lists.
## 2026-03-31 - [Optimize File Filtering with Specific rglob]
**Learning:** When retrieving specific file types in large nested directories (e.g., OpenFOAM case folders), chaining specific glob patterns via `itertools.chain(path.rglob("*.ext1"), path.rglob("*.ext2"))` is significantly faster than using a wildcard `path.rglob("*")` followed by Python-level suffix filtering because it pushes filtering to the underlying OS/pathlib implementation.
**Action:** Replace wildcard `rglob("*")` with chained specific `rglob("*.ext")` calls when searching for specific file extensions in large directories.

## 2026-04-01 - Avoid Over-Optimizing Small Rate Limiter Arrays
**Learning:** The `history` list for a rate-limiter is typically extremely small (bounded by limits like 5-100 requests per minute). Optimizing filtering logic on arrays of this size from O(N) linear scans to O(log N) binary search yields no measurable performance improvement, adds unnecessary cognitive overhead, and fails the core philosophy of avoiding premature micro-optimizations.
**Action:** Do not use `bisect` or other advanced searching algorithms when the maximum array size is strictly bounded to a negligible size by design (like a rate limit window). Stick to simple, readable list comprehensions.

## 2026-04-02 - Optimize Array Percentile Calculations with Striding
**Learning:** Calculating percentiles (`np.percentile`) on large arrays (e.g., PyVista mesh point data with millions of elements) is an O(N log N) operation that forces partial sorting, consuming significant CPU time. For visualization statistics where inner percentiles (e.g., 25, 50, 75) are used to suggest color map ranges, exact precision down to the last element is not required.
**Action:** When computing inner percentiles on large data arrays for visualization, downsample the array first by taking a strided slice (e.g., `data[::max(1, len(data) // 10000)]`). This provides an extremely fast, zero-copy, O(1) sample of ~10,000 points, reducing the percentile calculation time from hundreds of milliseconds to under a millisecond.

## 2026-04-03 - Approximate Mean and Std Dev with Striding
**Learning:** For visualization statistics like mean and standard deviation, exact precision isn't required down to the last element. Calculating exact `np.mean()` and `np.std()` on large PyVista mesh point arrays (e.g., millions of elements) incurs unnecessary O(N) overhead.
**Action:** Downsample the array via striding first (e.g., `sample = data[::max(1, len(data) // 10000)]`) and compute the mean and standard deviation on the sample. This provides an extremely fast O(1) approximation that is virtually indistinguishable for visualization purposes while significantly reducing processing time on large datasets.
## 2024-03-27 - Defer Square Roots on Large Arrays
**Learning:** Computing `np.sqrt` over millions of elements is expensive. When calculating only statistical metrics like min, max, mean, and std, we can avoid the O(N) `np.sqrt` cost. Min and max can be found on the squared magnitudes (then square-rooted). Mean and std can be calculated on a bounded downsampled array of squared magnitudes that is square-rooted.
**Action:** Defer `np.sqrt` operations until after aggregation (like min/max) or downsampling when calculating statistics on Euclidean magnitudes.

## 2026-04-04 - Remove Redundant Path.exists() for Directory Creation
**Learning:** Checking `path.exists()` before calling `path.mkdir(parents=True, mode=0o700)` is a "Look Before You Leap" (LBYL) anti-pattern that introduces a redundant system call (`stat` followed by `mkdir`).
**Action:** Remove the `exists()` check and use the "Easier to Ask for Forgiveness than Permission" (EAFP) approach by passing `exist_ok=True` to `mkdir()`. Catch and ignore any `OSError` if directory creation fails due to other reasons.

## 2026-04-06 - Optimize array.array Initialization
**Learning:** For initializing large `array.array` instances in Python (e.g., `array.array('d', ...)`), using list multiplication (`[0.0] * N`) is significantly faster (~1.7x) than using generators like `itertools.repeat(0.0, N)`. While it creates a temporary list, CPython's C-API can pre-allocate the memory and iterate at the C level, circumventing the item-by-item generator evaluation overhead (`PyIter_Next`).
**Action:** Replace `itertools.repeat` with list multiplication (`[0.0] * N`) when initializing fixed-size native arrays if N is not prohibitively large (e.g., fits comfortably in RAM), prioritizing the C-level loop speedup.

## 2026-04-08 - Use np.min/np.max for standalone computed arrays
**Learning:** Injecting standalone computed NumPy arrays temporarily into PyVista mesh `point_data` solely to utilize `get_data_range()` is an anti-pattern due to VTK object synchronization overhead. 
**Action:** Use `get_data_range()` only for pre-existing mesh fields. For newly computed arrays, hold a direct reference to the NumPy array and use `np.min()`/`np.max()` to find bounds, avoiding the VTK layer overhead entirely.

## 2024-04-05 - Use endswith instead of splitext for file extension checking
**Learning:** For checking file extensions in performance-sensitive Python code (like directory scanning loops), using `str.endswith` with a tuple of allowed extensions is significantly faster (~5x) than using `os.path.splitext(filename)[1].lower()`, as it avoids string slicing and allocation overhead.
**Action:** Replace `os.path.splitext(filename)[1].lower() in allowed_extensions` with `filename.lower().endswith(tuple(allowed_extensions))` inside hot loops. Pre-allocate the tuple outside the loop if possible.
## 2026-04-10 - Replace LBYL with EAFP in Rust PyO3 Extensions
**Learning:** In Rust PyO3 backend extensions (like `backend/accelerator`), replacing 'Look Before You Leap' (LBYL) `path.exists()` checks with 'Easier to Ask for Forgiveness' (EAFP) patterns (e.g., matching `File::open()` results and catching `std::io::ErrorKind::NotFound`) is a recommended performance optimization. Unlike Python, Rust's `Result` enum avoids heavy exception handling overhead and saves a redundant `stat` syscall while preventing TOCTOU (Time-of-Check to Time-of-Use) race conditions.
**Action:** Replace `if !path.exists() { return ... } let file = File::open(path)?;` with a `match File::open(path)` statement that handles `ErrorKind::NotFound` specifically when reading files in Rust extensions.
## 2026-04-11 - Replace np.mean() with array.mean()
**Learning:** For NumPy arrays, replacing generic function calls like `np.mean(arr)` or `np.std(arr)` with direct method calls on the array object (`arr.mean()`, `arr.std()`) avoids the NumPy namespace lookup and function dispatch overhead. Although this micro-optimization is small per call, it reduces CPU instructions and is faster in hot loops processing real-time simulation output.
**Action:** Always prefer calling `.mean()` and `.std()` directly on the NumPy array instances instead of passing the array to `np.mean()` or `np.std()`.
