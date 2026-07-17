import pytest
from app import app

@pytest.fixture
def client():
    app.config["TESTING"] = True
    app.config["ENABLE_CSRF"] = False  # Disable CSRF for testing
    app.config["ENABLE_API_HEALTH_CHECK"] = False  # Disable API health check for testing
    with app.test_client() as client:
        yield client

def test_create_slice_requires_json(client):
    response = client.post('/api/slice/create', data="notjson", content_type='text/plain')
    assert response.status_code == 400
    data = response.get_json()
    assert not data["success"]
    assert "Expected JSON" in data["error"]

def test_create_slice_missing_tutorial(client):
    response = client.post('/api/slice/create', json={"caseDir": "/path"})
    assert response.status_code == 400
    data = response.get_json()
    assert not data["success"]
    assert "Tutorial not specified" in data["error"]

def test_create_slice_missing_caseDir(client):
    response = client.post('/api/slice/create', json={"tutorial": "tutorial_name"})
    assert response.status_code == 400
    data = response.get_json()
    assert not data["success"]
    assert "Case directory not specified" in data["error"]

def test_create_slice_invalid_normal(client):
    response = client.post('/api/slice/create', json={"tutorial": "tutorial_name", "caseDir": "/path", "normal": "invalid"})
    assert response.status_code == 400
    data = response.get_json()
    assert not data["success"]
    assert "Invalid normal direction" in data["error"]

def test_create_slice_success(client, tmp_path, mocker):
    tutorial_dir = tmp_path / "test_tutorial"
    tutorial_dir.mkdir(parents=True, exist_ok=True)
    (vtk_file := tutorial_dir / "mesh.vtk").write_text("dummy VTK content")

    fake_viz_info = {
        "mode": "iframe",
        "src": "http://localhost:1234/index.html",
        "port": 1234
    }

    # Patch CASE_ROOT
    mocker.patch('app.CASE_ROOT', str(tmp_path))
    # Mock SliceVisualizer.process
    mock_process = mocker.patch('backend.post.slice.SliceVisualizer.process', return_value=fake_viz_info)

    response = client.post('/api/slice/create', json={
        "tutorial": "test_tutorial",
        "caseDir": str(tutorial_dir),
        "scalar_field": "U_Magnitude",
        "colormap": "viridis",
        "normal": "y"
    })
    
    assert response.status_code == 200
    data = response.get_json()
    assert data["mode"] == "iframe"
    assert data["src"] == "http://localhost:1234/index.html"
    
    mock_process.assert_called_once_with(
        str(vtk_file),
        {
            "scalar_field": "U_Magnitude",
            "colormap": "viridis",
            "normal": "y"
        }
    )

def test_streamline_placeholder(client, mocker):
    mocker.patch('backend.post.streamline.StreamlineVisualizer.process', return_value={"parent_id": "456"})
    response = client.post("/api/streamline/create", json={"parent_id": "456"})
    assert response.status_code == 501
    data = response.get_json()
    assert data["status"] == "coming_soon"
    assert "Streamline" in data["message"]
    assert data["details"]["parent_id"] == "456"

def test_surface_projection_placeholder(client, mocker):
    mocker.patch('backend.post.surface_projection.SurfaceProjectionVisualizer.process', return_value={"parent_id": "789"})
    response = client.post("/api/surface_projection/create", json={"parent_id": "789"})
    assert response.status_code == 501
    data = response.get_json()
    assert data["status"] == "coming_soon"
    assert "Surface projection" in data["message"]
    assert data["details"]["parent_id"] == "789"
