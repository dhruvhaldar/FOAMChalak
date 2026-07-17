
import pytest
from unittest.mock import patch, MagicMock
from app import app
import json

class TestCaseRootSecurity:

    @pytest.fixture
    def client(self):
        app.config.update({
            "TESTING": True,
            "ENABLE_CSRF": False,
            "ENABLE_API_HEALTH_CHECK": False
        })
        with app.test_client() as client:
            yield client

    def test_set_root_to_system_root_rejected(self, client):
        """Test that setting CASE_ROOT to '/' is rejected."""

        # Mock save_config to prevent actual file writes
        with patch('app.save_config', return_value=True):
            # We also need to patch CASE_ROOT if it's used, but the endpoint modifies the global
            # and then calls save_config.

            response = client.post('/set_case', json={'caseDir': '/'})

            assert response.status_code == 400
            data = response.get_json()
            assert "Cannot set case root to system directory" in data['output']

    def test_set_root_to_system_dir_rejected(self, client):
        """Test that setting CASE_ROOT to system directories (e.g., /etc) is rejected."""

        system_dirs = ['/etc', '/bin', '/usr', '/var', '/proc']

        with patch('app.save_config', return_value=True), \
             patch('platform.system', return_value='Linux'), \
             patch('app.Path') as MockPath:
            for path in system_dirs:
                mock_path_obj = MagicMock()
                resolved_mock = MagicMock()
                resolved_mock.__str__.return_value = path
                mock_path_obj.resolve.return_value = resolved_mock
                MockPath.return_value = mock_path_obj

                response = client.post('/set_case', json={'caseDir': path})

                assert response.status_code == 400
                data = response.get_json()
                assert "Cannot set case root to system directory" in data['output']

    def test_set_root_to_safe_dir_allowed(self, client, tmp_path):
        """Test that setting CASE_ROOT to a safe user directory is allowed."""

        safe_dir = tmp_path / "my_simulations"
        safe_dir.mkdir()
        safe_dir_str = str(safe_dir)

        with patch('app.save_config', return_value=True) as mock_save:
            response = client.post('/set_case', json={'caseDir': safe_dir_str})

            assert response.status_code == 200
            data = response.get_json()
            assert data['caseDir'] == safe_dir_str

            mock_save.assert_called_once()
