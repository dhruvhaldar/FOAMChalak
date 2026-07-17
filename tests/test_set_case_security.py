import pytest
from unittest.mock import patch, MagicMock
import app
import sys

@pytest.fixture
def client():
    app.app.config['TESTING'] = True
    app.app.config['ENABLE_CSRF'] = False
    app.app.config['ENABLE_API_HEALTH_CHECK'] = False
    with app.app.test_client() as client:
        yield client

def test_set_case_windows_vulnerability(client):
    """
    Test that simulates Windows environment and verifies that system directories
    are currently NOT blocked (demonstrating the vulnerability).
    """
    with patch('platform.system', return_value='Windows'):
        # Mock Path to return a Windows-like path when resolved
        with patch('app.Path') as MockPath:
            mock_path_obj = MagicMock()
            resolved_mock = MagicMock()

            # On Windows, str(Path) returns backslashes
            resolved_mock.__str__.return_value = "C:\\Windows\\System32"

            mock_path_obj.resolve.return_value = resolved_mock

            # Allow mkdir to succeed
            resolved_mock.mkdir.return_value = None

            MockPath.return_value = mock_path_obj

            # Mock save_config to avoid writing to disk
            with patch('app.save_config', return_value=True):
                response = client.post('/set_case', json={'caseDir': 'C:\\Windows\\System32'})

                # Assert that it fails (400) - verifying the fix
                assert response.status_code == 400
                assert "Cannot set case root to system directory" in response.get_json()['output']

def test_set_case_linux_protection(client):
    """
    Verify that Linux protection still works.
    """
    with patch('platform.system', return_value='Linux'):
        # On Linux, real Path works fine for this test, but we can mock for consistency
        with patch('app.Path') as MockPath:
            mock_path_obj = MagicMock()
            resolved_mock = MagicMock()
            resolved_mock.__str__.return_value = "/etc/shadow"
            mock_path_obj.resolve.return_value = resolved_mock

            MockPath.return_value = mock_path_obj

            with patch('app.save_config', return_value=True):
                response = client.post('/set_case', json={'caseDir': '/etc/shadow'})

                assert response.status_code == 400
                assert "Cannot set case root to system directory" in response.get_json()['output']
