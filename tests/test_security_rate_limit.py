import pytest
import time
from unittest.mock import MagicMock
from app import app, rate_limit

# Mock the RateLimiter storage to start fresh for each test
@pytest.fixture(autouse=True)
def reset_rate_limit_storage(monkeypatch):
    """Reset the rate limit storage before each test."""
    import app as app_module
    if hasattr(app_module, '_request_history'):
        monkeypatch.setattr(app_module, '_request_history', {})

    # Enable rate limiting for these tests specifically
    app.config["ENABLE_RATE_LIMIT"] = True

def test_run_endpoint_rate_limiting(mocker):
    """Test that the /run endpoint is rate limited."""
    client = app.test_client()

    # Mock validate_safe_path to always pass for our test input
    from pathlib import Path
    mocker.patch('app.validate_safe_path', return_value=Path("case_root/basic/pitzDaily"))

    # Mock threading.Thread so we don't spawn threads
    mocker.patch('threading.Thread')

    # Mock is_safe_command to pass
    mocker.patch('app.is_safe_command', return_value=True)

    # Mock get_docker_client to return None (docker unavailable)
    # OR return a mock. If it returns None, run_case yields an error message but it still runs the logic.
    # The rate limit should hit BEFORE the generator starts?
    # Actually, `run_case` returns a Response object wrapping a generator.
    # The rate limit decorator will run when `run_case` is called.

    # Payload for /run
    payload = {
        "tutorial": "basic/pitzDaily",
        "command": "blockMesh",
        "caseDir": "case_root/basic/pitzDaily"
    }

    # Send 5 allowed requests
    for i in range(5):
        response = client.post('/run', json=payload)
        # It might return 200 (stream) or 400 (if mocks fail validation)
        # We just care that it's NOT 429
        assert response.status_code != 429, f"Request {i+1} failed with 429"

    # The 6th request should fail
    response = client.post('/run', json=payload)
    assert response.status_code == 429, "Rate limit should have been triggered on 6th request"

    # Check error message
    data = response.get_json()
    assert "error" in data
    assert "Too many requests" in data["error"]

def test_load_tutorial_rate_limiting(mocker):
    """Test that the /load_tutorial endpoint is rate limited."""
    client = app.test_client()

    mocker.patch('app.get_docker_client', return_value=None)
    from pathlib import Path
    mocker.patch('app.validate_safe_path', return_value=Path("basic/pitzDaily"))

    payload = {"tutorial": "basic/pitzDaily"}

    # Send 5 allowed requests
    for i in range(5):
        response = client.post('/load_tutorial', json=payload)
        assert response.status_code != 429

    # The 6th request should fail
    response = client.post('/load_tutorial', json=payload)
    assert response.status_code == 429

    # Check error message
    data = response.get_json()
    assert "output" in data or "error" in data
