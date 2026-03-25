import os
import time
import pytest
from backend.plots.realtime_plots import (
    OpenFOAMFieldParser,
    _DIR_SCAN_CACHE,
    clear_cache,
)


def test_dir_scan_cache_cleanup(tmp_path):
    clear_cache()

    print(f"\nDEBUG: tmp_path={tmp_path}")

    # 1. Setup
    case_dir = tmp_path / "case"
    case_dir.mkdir()
    parser = OpenFOAMFieldParser(case_dir)

    # 2. Add time 0.1
    t1 = case_dir / "0.1"
    t1.mkdir()
    (t1 / "p").write_text("class volScalarField;\ninternalField uniform 1;")

    # Ensure mtime updates
    time.sleep(0.01)

    print("DEBUG: Calling get_all_time_series_data (1)")
    # 3. Call get_all_time_series_data
    # This scans 0.1 as the latest time
    parser.get_all_time_series_data()

    print(f"DEBUG: Cache keys after step 3: {_DIR_SCAN_CACHE.keys()}")

    # Verify 0.1 is in cache
    scan_keys_1 = [k for k in _DIR_SCAN_CACHE if "0.1" in k]
    assert (
        len(scan_keys_1) == 1
    ), f"0.1 should be cached as latest. Keys: {_DIR_SCAN_CACHE.keys()}"

    # 4. Add time 0.2
    # Touch case dir to ensure mtime change if mkdir is too fast
    t2 = case_dir / "0.2"
    t2.mkdir()
    (t2 / "p").write_text("class volScalarField;\ninternalField uniform 2;")
    os.utime(case_dir, None)

    print("DEBUG: Calling get_all_time_series_data (2)")
    # 5. Call get_all_time_series_data
    # 0.1 becomes stable. 0.2 is latest.
    parser.get_all_time_series_data()

    print(f"DEBUG: Cache keys after step 5: {_DIR_SCAN_CACHE.keys()}")

    # Verify 0.2 is in cache
    scan_keys_2 = [k for k in _DIR_SCAN_CACHE if "0.2" in k]
    assert (
        len(scan_keys_2) == 1
    ), f"0.2 should be cached as latest. Keys: {_DIR_SCAN_CACHE.keys()}"

    # Current behavior check: Is 0.1 still in cache?
    # If unoptimized, it remains.
    scan_keys_1_after = [k for k in _DIR_SCAN_CACHE if "0.1" in k]

    # 6. Add time 0.3
    t3 = case_dir / "0.3"
    t3.mkdir()
    (t3 / "p").write_text("class volScalarField;\ninternalField uniform 3;")
    os.utime(case_dir, None)

    print("DEBUG: Calling get_all_time_series_data (3)")
    parser.get_all_time_series_data()

    print(f"DEBUG: Cache keys after step 6: {_DIR_SCAN_CACHE.keys()}")

    # Now 0.1 and 0.2 are stable. 0.3 is latest.
    scan_keys_1_final = [k for k in _DIR_SCAN_CACHE if "0.1" in k]
    scan_keys_2_final = [k for k in _DIR_SCAN_CACHE if "0.2" in k]
    scan_keys_3_final = [k for k in _DIR_SCAN_CACHE if "0.3" in k]

    # Assertions for the optimization (FAIL if not optimized)
    # We want 0.1 and 0.2 to be GONE.
    if len(scan_keys_1_final) > 0 or len(scan_keys_2_final) > 0:
        pytest.fail(
            f"Memory Leak: Stable directories remain in _DIR_SCAN_CACHE. Keys: {_DIR_SCAN_CACHE.keys()}"
        )
