import os
import tempfile
import array
import numpy as np
import unittest
from backend.plots.realtime_plots import OpenFOAMFieldParser, _RESIDUALS_CACHE

class TestResidualsOptimization(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.TemporaryDirectory()
        self.case_dir = self.test_dir.name
        self.log_file = os.path.join(self.case_dir, "log.foamRun")

        # Create a dummy log file
        with open(self.log_file, "wb") as f:
            f.write(b"Time = 0.1\n")
            f.write(b"Solving for Ux, Initial residual = 0.5, Final residual = 0.01, No Iterations 1\n")
            f.write(b"Solving for p, Initial residual = 0.2, Final residual = 0.001, No Iterations 5\n")
            f.write(b"\n")
            f.write(b"Time = 0.2\n")
            f.write(b"Solving for Ux, Initial residual = 0.4, Final residual = 0.005, No Iterations 1\n")
            f.write(b"Solving for p, Initial residual = 0.1, Final residual = 0.0005, No Iterations 4\n")

        self.parser = OpenFOAMFieldParser(self.case_dir)
        _RESIDUALS_CACHE.clear()

    def tearDown(self):
        self.test_dir.cleanup()
        _RESIDUALS_CACHE.clear()

    def test_get_residuals_returns_arrays(self):
        residuals = self.parser.get_residuals_from_log("log.foamRun")

        # Check type
        self.assertIsInstance(residuals, dict)
        self.assertIsInstance(residuals["time"], array.array)
        self.assertIsInstance(residuals["Ux"], array.array)
        self.assertIsInstance(residuals["p"], array.array)

        # Check typecode
        self.assertEqual(residuals["time"].typecode, 'd')
        self.assertEqual(residuals["Ux"].typecode, 'd')

        # Check values
        self.assertEqual(list(residuals["time"]), [0.1, 0.2])
        self.assertEqual(list(residuals["Ux"]), [0.5, 0.4])
        self.assertEqual(list(residuals["p"]), [0.2, 0.1])

    def test_numpy_conversion(self):
        residuals = self.parser.get_residuals_from_log("log.foamRun")

        # Simulate app.py conversion
        converted = {}
        for k, v in residuals.items():
            if isinstance(v, array.array):
                converted[k] = np.frombuffer(v, dtype=float)
            else:
                converted[k] = v

        # Check numpy arrays
        self.assertIsInstance(converted["time"], np.ndarray)
        self.assertIsInstance(converted["Ux"], np.ndarray)

        # Check values preserved
        np.testing.assert_array_equal(converted["time"], np.array([0.1, 0.2]))
        np.testing.assert_array_equal(converted["Ux"], np.array([0.5, 0.4]))

        # Check zero copy (if we modify array, numpy view should reflect it?)
        # array.array is mutable. np.frombuffer creates a view.
        residuals["time"][0] = 9.9
        self.assertEqual(converted["time"][0], 9.9)

    def test_cache_immutability(self):
        """Verify that the conversion logic in app.py does not mutate the cache."""
        residuals = self.parser.get_residuals_from_log("log.foamRun")

        # Simulate app.py logic with explicit copy
        response_data = residuals.copy()
        for k, v in response_data.items():
            if isinstance(v, array.array):
                response_data[k] = np.frombuffer(v, dtype=float)

        # Verify residuals (which represents the cache) still holds array.array
        self.assertIsInstance(residuals["time"], array.array)
        self.assertIsInstance(residuals["Ux"], array.array)

        # Verify response_data holds numpy arrays
        self.assertIsInstance(response_data["time"], np.ndarray)
        self.assertIsInstance(response_data["Ux"], np.ndarray)

if __name__ == "__main__":
    unittest.main()
