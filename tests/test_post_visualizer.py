import pytest
from app import app
from unittest.mock import patch, MagicMock

@pytest.fixture
def client():
    app.config["TESTING"] = True
    import app as app_module
    app_module.STARTUP_STATUS["status"] = "completed"
    with app.test_client() as client:
        client.set_cookie("csrf_token", "test_csrf_token")
        yield client

def test_api_start_trame_visualizer_success(client):
    with patch("backend.post.postprocessor.TrameVisualizer.start_visualization") as mock_start:
        mock_start.return_value = {
            "status": "success",
            "mode": "iframe",
            "src": "http://127.0.0.1:12230/index.html",
            "port": 12230
        }
        res = client.post(
            "/api/post/visualizer/start",
            json={"caseDir": "airfoil2D", "operation": "Slice"},
            headers={"X-CSRFToken": "test_csrf_token"}
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "success"
        assert data["port"] == 12230

def test_api_start_trame_visualizer_missing_casedir(client):
    res = client.post(
        "/api/post/visualizer/start",
        json={},
        headers={"X-CSRFToken": "test_csrf_token"}
    )
    assert res.status_code == 400
    data = res.get_json()
    assert data["status"] == "error"
    assert "Case directory not specified" in data["message"]
