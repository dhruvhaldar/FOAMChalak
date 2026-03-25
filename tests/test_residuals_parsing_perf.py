
import pytest
import os
from unittest.mock import patch, MagicMock
from backend.plots.realtime_plots import OpenFOAMFieldParser, _RESIDUALS_CACHE

def test_residuals_parsing_optimization(tmp_path):
    # Content with spaces - this is the problematic case where manual parsing fails
    # Standard format: "Solving for Ux, Initial residual = 0.123, Final residual = ..."
    # "Initial residual =" is followed by a space, then value.
    content = """Time = 1
Solving for Ux, Initial residual = 0.123, Final residual = 0.001, No Iterations 1
"""
    log_file = tmp_path / "log.foamRun"
    log_file.write_text(content)

    # Clear cache
    _RESIDUALS_CACHE.clear()

    parser = OpenFOAMFieldParser(tmp_path)

    # Patch regex to spy on calls
    with patch("backend.plots.realtime_plots.RESIDUAL_REGEX_BYTES") as mock_regex:
        residuals = parser.get_residuals_from_log("log.foamRun")

        # Check results - verify parsing works
        assert residuals["Ux"] == [0.123]

        # Verify regex usage
        # After fix: Should NOT be called
        assert mock_regex.search.call_count == 0, "Regex fallback triggered (Bug exists)"

if __name__ == "__main__":
    pytest.main([__file__])
