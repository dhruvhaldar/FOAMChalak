import pytest
from backend.post.trame_vtk_slicer import IsosurfaceVisualizer


def test_isosurface_visualizer_start(mocker):
    """Test IsosurfaceVisualizer delegation to TrameVisualizer."""
    mock_start = mocker.patch("backend.post.postprocessor.TrameVisualizer.start_visualization", return_value={"status": "success", "port": 12345})

    viz = IsosurfaceVisualizer()
    res = viz.start_visualization("dummy.vtk", {"operation": "Slice"})

    assert res["status"] == "success"
    assert res["port"] == 12345
    mock_start.assert_called_once()
