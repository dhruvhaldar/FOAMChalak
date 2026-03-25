
import pytest
from unittest.mock import MagicMock, patch
import numpy as np
from backend.mesh.mesher import MeshVisualizer

def test_mesh_screenshot_valid_dimensions():
    """
    Test that get_mesh_screenshot accepts valid dimensions.
    """
    visualizer = MeshVisualizer()
    visualizer.mesh = MagicMock()

    with patch("pyvista.Plotter") as MockPlotter:
        mock_plotter_instance = MockPlotter.return_value

        # Mock screenshot to return a numpy array (which pyvista uses)
        # Create a dummy image array (height, width, 3)
        dummy_img = np.zeros((600, 800, 3), dtype=np.uint8)
        mock_plotter_instance.screenshot.return_value = dummy_img

        # Attempt with valid dimensions
        valid_width = 800
        valid_height = 600

        # Patch load_mesh to avoid FileNotFoundError and return success
        with patch("pathlib.Path.exists", return_value=True):
            with patch("pathlib.Path.stat") as mock_stat:
                mock_stat.return_value.st_mtime = 123456.0
                with patch.object(visualizer, 'load_mesh', return_value={"success": True}) as mock_load:
                     result = visualizer.get_mesh_screenshot("dummy.vtk", width=valid_width, height=valid_height)

        # Assert that the result is NOT None
        assert result is not None
        assert isinstance(result, str)

        # Verify load_mesh was called
        mock_load.assert_called_once()

def test_mesh_screenshot_large_dimensions():
    """
    Test that get_mesh_screenshot rejects dimensions that are too large.
    """
    visualizer = MeshVisualizer()

    # Attempt with invalid dimensions (> 4096)
    invalid_width = 5000
    invalid_height = 600

    result = visualizer.get_mesh_screenshot("dummy.vtk", width=invalid_width, height=invalid_height)

    assert result is None
