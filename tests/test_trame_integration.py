import pytest
from unittest.mock import MagicMock
import time

# Create a mock for backend.post.isosurface.VisualizationManager.get_instance()._wait_for_port
# to avoid the infinite loop or timeout in tests.

def test_backend_trame_process_start(mocker):
    """
    Test that the backend correctly spawns the Trame process.
    """
    from backend.post.trame_vtk_slicer import VisualizationManager

    # Mock multiprocessing
    mock_process = mocker.patch("multiprocessing.Process")
    mock_queue = mocker.patch("multiprocessing.Queue")

    # Setup queue return value
    q_instance = mock_queue.return_value
    q_instance.get.return_value = {"port": 12345}

    manager = VisualizationManager.get_instance()

    mocker.patch.object(manager, '_resolve_target_file', return_value="dummy.vtk")
    mocker.patch("backend.post.postprocessor._wait_for_port", return_value=True)

    result = manager.start_visualization("dummy.vtk", {})

    assert result["mode"] == "iframe"
    assert "12345" in result["src"]
    assert result["port"] == 12345

    # Verify process started
    mock_process.assert_called_once()
    mock_process.return_value.start.assert_called_once()

    # Cleanup
    manager.stop_visualization()

def test_slice_visualizer_start(mocker):
    """
    Test that SliceVisualizer correctly spawns its process.
    """
    from backend.post.trame_vtk_slicer import SliceVisualizer

    # Mock multiprocessing
    mock_process = mocker.patch("multiprocessing.Process")
    mock_queue = mocker.patch("multiprocessing.Queue")

    # Setup queue return value
    q_instance = mock_queue.return_value
    q_instance.get.return_value = {"port": 54321, "url": "http://127.0.0.1:54321/index.html"}

    # Mock _resolve_target_file to return a dummy string
    # Since it's an instance method, we can patch it on the class or instance.
    # The code calls self._resolve_target_file.

    viz = SliceVisualizer()
    mocker.patch.object(viz, '_resolve_target_file', return_value="/tmp/dummy.vtk")
    mocker.patch("backend.post.postprocessor._wait_for_port", return_value=True)

    result = viz.process("/tmp/case", {})

    assert result["status"] == "success"
    assert result["mode"] == "iframe"
    assert "54321" in result["src"]

    mock_process.assert_called_once()
