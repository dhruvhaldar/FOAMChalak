
import pytest
from app import app, db, SimulationRun
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

@pytest.fixture
def client():
    """Configures the app for testing."""
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["ENABLE_CSRF"] = False
    app.config["ENABLE_RATE_LIMIT"] = False

    with app.app_context():
        # Dispose of old engine to ensure new config takes effect
        db.engine.dispose()
        db.create_all()

    with app.test_client() as client:
        with app.app_context():
            db.create_all()
        yield client
        with app.app_context():
            db.session.remove()
            db.drop_all()

@patch("app.get_docker_client")
def test_simulation_run_lifecycle(mock_get_docker_client, client):
    """Test that a simulation run is created, updated, and completed correctly."""

    # Mock Docker Client and Container
    mock_docker = MagicMock()
    mock_container = MagicMock()
    mock_get_docker_client.return_value = mock_docker
    mock_docker.containers.run.return_value = mock_container

    # Mock logs streaming
    mock_container.logs.return_value = [b"Starting simulation...", b"Running...", b"Finished."]

    # Mock config
    with patch("app.CASE_ROOT", "/tmp/test_case_root"):
        with patch("app.validate_safe_path", return_value=True): # Bypass path validation for unit test simplicity

            # 1. Trigger Run
            payload = {
                "tutorial": "basic/pitzDaily",
                "command": "blockMesh",
                "caseDir": "/tmp/test_case_root/basic/pitzDaily"
            }

            response = client.post("/run", json=payload)
            assert response.status_code == 200

            # Consume the stream to ensure the generator completes
            list(response.response)

            # 2. Verify Database Record
            with app.app_context():
                # Filter by case_name to avoid interference from other tests if DB reset fails
                runs = db.session.execute(db.select(SimulationRun).where(SimulationRun.case_name == payload["caseDir"])).scalars().all()
                assert len(runs) >= 1, f"Expected at least 1 run for {payload['caseDir']}, found {len(runs)}"
                run = runs[-1]

                assert run.case_name == payload["caseDir"]
                assert run.tutorial == payload["tutorial"]
                assert run.command == payload["command"]
                assert run.status == "Completed"
                assert run.start_time is not None
                assert run.end_time is not None
                assert run.execution_duration is not None
                assert run.execution_duration >= 0

@patch("app.get_docker_client")
def test_simulation_run_failure(mock_get_docker_client, client):
    """Test that a failed simulation run updates the status to Failed."""

    # Mock Docker Client to raise an exception during run
    mock_docker = MagicMock()
    mock_get_docker_client.return_value = mock_docker
    mock_docker.containers.run.side_effect = Exception("Docker Error")

    with patch("app.CASE_ROOT", "/tmp/test_case_root"):
        with patch("app.validate_safe_path", return_value=True):

            payload = {
                "tutorial": "basic/pitzDaily",
                "command": "blockMesh",
                "caseDir": "/tmp/test_case_root/basic/pitzDaily"
            }

            response = client.post("/run", json=payload)

            # Consume stream (it will yield error messages)
            output = b"".join(response.response).decode()
            assert "Failed to start container" in output

            # Verify Database Record
            with app.app_context():
                run = db.session.execute(db.select(SimulationRun)).scalar_one()
                assert run.status == "Failed"
                assert run.end_time is not None

def test_long_case_name(client):
    """Test that long case names are supported."""
    long_path = "/" + "a" * 250 + "/case"

    with app.app_context():
        run = SimulationRun(
            case_name=long_path,
            tutorial="tut",
            command="cmd",
            status="Pending"
        )
        db.session.add(run)
        db.session.commit()

        saved_run = db.session.execute(db.select(SimulationRun)).scalar_one()
        assert saved_run.case_name == long_path

def test_api_list_runs(client):
    """Test the API endpoint for listing runs."""

    # Create some dummy runs
    with app.app_context():
        run1 = SimulationRun(
            case_name="case1",
            tutorial="tut1",
            command="cmd1",
            status="Completed",
            start_time=datetime.utcnow() - timedelta(minutes=10),
            end_time=datetime.utcnow() - timedelta(minutes=5),
            execution_duration=300.0
        )
        run2 = SimulationRun(
            case_name="case2",
            tutorial="tut2",
            command="cmd2",
            status="Running",
            start_time=datetime.utcnow()
        )
        db.session.add(run1)
        db.session.add(run2)
        db.session.commit()

    # Fetch from API
    response = client.get("/api/runs")
    assert response.status_code == 200
    data = response.json

    assert "runs" in data
    assert len(data["runs"]) == 2

    # Check ordering (descending start_time)
    assert data["runs"][0]["case_name"] == "case2"
    assert data["runs"][1]["case_name"] == "case1"

    # Check fields
    r1 = data["runs"][1]
    assert r1["status"] == "Completed"
    assert r1["execution_duration"] == 300.0
    assert r1["start_time"] is not None
    assert r1["end_time"] is not None


def test_api_list_runs_grouped(client):
    """Test grouped API support for the run-history UI."""
    with app.app_context():
        db.session.add_all([
            SimulationRun(
                case_name="case1",
                tutorial="tut1",
                command="blockMesh",
                status="Completed",
                start_time=datetime.utcnow() - timedelta(minutes=10),
            ),
            SimulationRun(
                case_name="case1",
                tutorial="tut1",
                command="foamRun",
                status="Running",
                start_time=datetime.utcnow(),
                container_id="abcdef1234567890",
            ),
            SimulationRun(
                case_name="case2",
                tutorial="tut2",
                command="Allrun",
                status="Failed",
                start_time=datetime.utcnow() - timedelta(minutes=5),
            ),
        ])
        db.session.commit()

    response = client.get("/api/runs?group=true")
    assert response.status_code == 200
    data = response.json

    assert "grouped_runs" in data
    groups = {group["case_name"]: group["runs"] for group in data["grouped_runs"]}
    assert set(groups) == {"case1", "case2"}
    assert len(groups["case1"]) == 2
    assert groups["case1"][0]["container_id"] == "abcdef1234567890"


def test_api_get_run_log_and_open_folder(client, tmp_path):
    """Test history row actions for reading logs and validating case folders."""
    case_root = tmp_path / "cases"
    case_dir = case_root / "case1"
    log_dir = case_dir / "logs"
    log_dir.mkdir(parents=True)
    log_file = log_dir / "run_1.log"
    log_file.write_text("line 1\nline 2\n", encoding="utf-8")

    with patch("app.CASE_ROOT", str(case_root)):
        with app.app_context():
            run = SimulationRun(
                case_name=str(case_dir),
                tutorial="tut1",
                command="blockMesh",
                status="Completed",
                start_time=datetime.utcnow(),
                log_file_path=str(log_file),
            )
            db.session.add(run)
            db.session.commit()
            run_id = run.id

        log_response = client.get(f"/api/runs/{run_id}/log")
        assert log_response.status_code == 200
        assert log_response.json["log"] == "line 1\nline 2\n"

        folder_response = client.get(f"/api/runs/open_folder/{run_id}")
        assert folder_response.status_code == 200
        assert folder_response.json == {"path": str(case_dir), "exists": True}
