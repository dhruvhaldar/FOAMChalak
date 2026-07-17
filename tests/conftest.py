
import pytest
import sys
from pathlib import Path
from unittest.mock import MagicMock

# Ensure the app module can be imported
sys.path.append(str(Path(__file__).parent.parent))

# Create a proper Mock for docker module that includes a real Exception class for DockerException
mock_docker = MagicMock()
mock_docker_errors = MagicMock()

# Define a real exception class
class MockDockerException(Exception):
    pass

class MockContainerError(MockDockerException):
    def __init__(self, container, exit_status, command, image, stderr=None):
        super().__init__(stderr)
        self.container = container
        self.exit_status = exit_status
        self.command = command
        self.image = image
        self.stderr = stderr

class MockImageNotFound(MockDockerException):
    pass

mock_docker_errors.DockerException = MockDockerException
mock_docker_errors.ContainerError = MockContainerError
mock_docker_errors.ImageNotFound = MockImageNotFound
mock_docker.errors = mock_docker_errors

sys.modules['docker'] = mock_docker
sys.modules['docker.errors'] = mock_docker_errors

import app as flask_app

@pytest.fixture
def app():
    # Disable rate limiting for general tests to avoid flaky failures
    flask_app.app.config.update({
        "TESTING": True,
        "ENABLE_RATE_LIMIT": False,
        "ENABLE_CSRF": False,
        "ENABLE_API_HEALTH_CHECK": False
    })

    # Reset global startup status to default to prevent cross-test pollution
    flask_app.STARTUP_STATUS = {"status": "starting", "message": "Initializing..."}

    # Reset rate limit history
    if hasattr(flask_app, '_request_history'):
        flask_app._request_history = {}

    yield flask_app.app

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def runner(app):
    return app.test_cli_runner()
