"""
Tests for the main FOAMFlask application endpoints.
"""
import json
import os
import runpy
import sys
from pathlib import Path

import pytest
from unittest.mock import patch, MagicMock, mock_open
from docker.errors import DockerException

# Import the app module
import app as flask_app
# from app import main

# Mock the isosurface_visualizer module
sys.modules['isosurface_visualizer'] = MagicMock()
from isosurface_visualizer import load_mesh, generate_isosurfaces, get_interactive_html

def test_index_route(client):
    """Test the index route returns a successful response."""
    response = client.get('/')
    assert response.status_code == 200
    assert b'FOAMFlask' in response.data

def test_is_safe_command():
    """Test the is_safe_command function with various inputs."""
    # Test valid commands
    assert flask_app.is_safe_command("simple-command") is True
    assert flask_app.is_safe_command("command-with-dashes") is True
    assert flask_app.is_safe_command("command_with_underscores") is True
    assert flask_app.is_safe_command("command with spaces") is True
    assert flask_app.is_safe_command("command123") is True

    # Test invalid commands
    # Empty or None
    assert flask_app.is_safe_command("") is False
    assert flask_app.is_safe_command(None) is False
    assert flask_app.is_safe_command(123) is False  # Not a string

    # Test dangerous characters
    dangerous_chars = [';', '&', '|', '`', '$', '(', ')', '<', '>', '"', "'", '%', '*', '?', '[', ']', '~', '!', '{', '}']
    for char in dangerous_chars:
        assert flask_app.is_safe_command(f"command{char}") is False, f"Failed for character: {char}"

    # Test command combinations
    assert flask_app.is_safe_command("command; rm -rf /") is False  # Command separator
    assert flask_app.is_safe_command("command && rm -rf /") is False  # Logical AND
    assert flask_app.is_safe_command("command || rm -rf /") is False  # Logical OR
    assert flask_app.is_safe_command("command | rm -rf /") is False  # Pipe
    assert flask_app.is_safe_command("command `rm -rf /`") is False  # Backticks
    assert flask_app.is_safe_command("command $(rm -rf /)") is False  # Command substitution
    assert flask_app.is_safe_command('command "dangerous"') is False  # Double quotes
    assert flask_app.is_safe_command("command 'dangerous'") is False  # Single quotes
    assert flask_app.is_safe_command("command<dangerous") is False  # Input redirection
    assert flask_app.is_safe_command("command>dangerous") is False  # Output redirection
    assert flask_app.is_safe_command("command(dangerous)") is False  # Parentheses

    # Test path traversal
    assert flask_app.is_safe_command("command ../../dangerous") is False
    assert flask_app.is_safe_command("command /etc/passwd") is True  # Allowed, handled by command validation
    assert flask_app.is_safe_command("command /etc/../etc/passwd") is False
    assert flask_app.is_safe_command("command ./../dangerous") is False
    assert flask_app.is_safe_command("command ~/dangerous") is False  # Tilde expansion is BLOCKED

    # Test file descriptor redirection
    assert flask_app.is_safe_command("command 2>error.log") is False
    assert flask_app.is_safe_command("command 1>output.log") is False
    assert flask_app.is_safe_command("command 0<input.txt") is False
    assert flask_app.is_safe_command("command 10>file") is False  # Multi-digit file descriptor
    assert flask_app.is_safe_command("command 2>&1") is False  # Redirect stderr to stdout
    assert flask_app.is_safe_command("command 3>file 4<input") is False  # Multiple redirections
    assert flask_app.is_safe_command("command >file") is False  # Default stdout redirection
    assert flask_app.is_safe_command("command <input") is False  # Default stdin redirection

    # Test command substitution variations
    assert flask_app.is_safe_command("command_`inside`backticks") is False
    assert flask_app.is_safe_command("command_$(inside)parentheses") is False
    assert flask_app.is_safe_command("`only_backticks`") is False
    assert flask_app.is_safe_command("$(only_command_sub)") is False
    assert flask_app.is_safe_command("command_`echo test`_end") is False

    # Test background/foreground
    assert flask_app.is_safe_command("command &") is False
    assert flask_app.is_safe_command("command %") is False
    assert flask_app.is_safe_command("command &> /dev/null &") is False  # Common background pattern

    # Test length check
    long_command = "a" * 100
    assert flask_app.is_safe_command(long_command) is True
    assert flask_app.is_safe_command(long_command + "a") is False  # 101 characters
    assert flask_app.is_safe_command("x" * 1000) is False  # Very long command

    # Test mixed cases
    assert flask_app.is_safe_command("command; $(rm -rf /) && echo 'hacked'") is False
    assert flask_app.is_safe_command("command `echo test` > file") is False
    assert flask_app.is_safe_command("command $(cat /etc/passwd) | grep root") is False

def test_is_safe_script_name():
    """Test the is_safe_script_name function with various inputs."""
    # Test valid script names
    assert flask_app.is_safe_script_name("script.sh") is True
    assert flask_app.is_safe_script_name("test_script-1.2.3.py") is True
    assert flask_app.is_safe_script_name("UPPERCASE_SCRIPT") is True
    assert flask_app.is_safe_script_name("123_script.456") is True
    assert flask_app.is_safe_script_name("a" * 50) is True  # Max length

    # Test invalid script names
    # Empty or None
    assert flask_app.is_safe_script_name("") is False
    assert flask_app.is_safe_script_name(None) is False
    assert flask_app.is_safe_script_name(123) is False  # Not a string

    # Test invalid characters
    invalid_chars = ['!', '@', '#', '$', '$(','%', '`','^', '&', '*', '(', ')', '=', '+', 
                    '{', '}', '[', ']', ':', ';', "'", '"', ',', '<', '>', '?', '/', '\\']
    for char in invalid_chars:
        assert flask_app.is_safe_script_name(f"script{char}") is False, f"Failed for character: {char}"

    # Test path traversal attempts
    assert flask_app.is_safe_script_name("../malicious.sh") is False
    assert flask_app.is_safe_script_name("/etc/passwd") is False
    assert flask_app.is_safe_script_name("folder/script.sh") is False
    assert flask_app.is_safe_script_name("folder\\script.sh") is False
    assert flask_app.is_safe_script_name("..\\..\\malicious.sh") is False

    # Test hidden files
    assert flask_app.is_safe_script_name(".hidden") is False
    assert flask_app.is_safe_script_name("..hidden") is False  # Not actually hidden, just starts with dots
    assert flask_app.is_safe_script_name("file.") is True  # Ends with dot is allowed

    # Test length limits
    assert flask_app.is_safe_script_name("a" * 50) is True  # Max length
    assert flask_app.is_safe_script_name("a" * 51) is False  # Too long

    # Test edge cases
    assert flask_app.is_safe_script_name(" ") is False  # Whitespace only
    assert flask_app.is_safe_script_name("script with spaces.sh") is False  # Spaces not allowed
    assert flask_app.is_safe_script_name("script\twith\ttabs.sh") is False  # Tabs not allowed
    assert flask_app.is_safe_script_name("script\nwith\nnewlines.sh") is False  # Newlines not allowed

def test_is_safe_command_with_substitution_and_redirection():
    # Command substitution
    assert flask_app.is_safe_command("command_$(rm -rf /)") is False
    assert flask_app.is_safe_command("command `rm -rf /`") is False
    assert flask_app.is_safe_command("`only_backticks`") is False
    assert flask_app.is_safe_command("$(only_command_sub)") is False
    assert flask_app.is_safe_command("command normal") is True  # Control positive

    # File descriptor redirection
    assert flask_app.is_safe_command("command 2> error.log") is False
    assert flask_app.is_safe_command("command 1> output.log") is False
    assert flask_app.is_safe_command("command 0<input.txt") is False
    assert flask_app.is_safe_command("command 10> file") is False  # multi-digit fd
    assert flask_app.is_safe_command("command without redirection") is True  # Control positive

def test_load_config_no_file(tmp_path):
    # Patch CONFIG_FILE to a non-existent file path
    non_existent_file = tmp_path / "nonexistent.json"
    with patch('app.CONFIG_FILE', non_existent_file):
        # Ensure file does not exist
        assert not non_existent_file.exists()
        config = flask_app.load_config()
        # Should return defaults
        assert Path(config["CASE_ROOT"]).resolve() == Path("tutorial_cases").resolve()
        assert config["DOCKER_IMAGE"] == "haldardhruv/ubuntu_noble_openfoam:v12"
        assert config["OPENFOAM_VERSION"] == "12"

def test_load_config_with_valid_file(tmp_path):
    config_file = tmp_path / "case_config.json"
    data = {
        "CASE_ROOT": "/custom/path",
        "DOCKER_IMAGE": "custom/image:latest",
        "OPENFOAM_VERSION": "13"
    }
    config_file.write_text(json.dumps(data), encoding="utf-8")

    with patch('app.CONFIG_FILE', config_file):
        config = flask_app.load_config()
        # Should merge defaults and file content, but file data overrides defaults
        assert config["CASE_ROOT"] == "/custom/path"
        assert config["DOCKER_IMAGE"] == "custom/image:latest"
        assert config["OPENFOAM_VERSION"] == "13"

def test_load_config_with_invalid_json(tmp_path, caplog):
    config_file = tmp_path / "case_config.json"
    # Write invalid JSON content
    config_file.write_text("{invalid json}", encoding="utf-8")

    with patch('app.CONFIG_FILE', config_file):
        with caplog.at_level("WARNING"):
            config = flask_app.load_config()
            # Should return defaults on JSONDecodeError
            assert Path(config["CASE_ROOT"]).resolve() == Path("tutorial_cases").resolve()
            assert any("Could not load config file" in record.message for record in caplog.records)

def test_load_config_with_os_error(tmp_path, monkeypatch):
    # Create a directory where file is expected to trigger OSError (IsADirectoryError)
    # or just use permission denied if easier, but mocking is safer for CI.

    # We'll use mock_open to raise OSError since creating actual permission denied files
    # in temp dirs can be tricky across OSs.

    # We need to patch pathlib.Path.open instead of builtins.open

    with patch('pathlib.Path.open', side_effect=OSError("Permission denied")):
        with patch('app.CONFIG_FILE', Path('dummy_path.json')):
             # We assume CONFIG_FILE.exists() is true to reach open()
            with patch('pathlib.Path.exists', return_value=True):
                result = flask_app.load_config()
                # Should return defaults on OSError
                assert Path(result["CASE_ROOT"]).resolve() == Path("tutorial_cases").resolve()

def test_save_config_success(tmp_path):
    # Use a real temporary file for the config file
    config_file = tmp_path / "case_config.json"

    with patch('app.CONFIG_FILE', config_file), \
         patch('app.load_config', return_value={"CASE_ROOT": "/default/path"}):
        
        updates = {"DOCKER_IMAGE": "new-image:latest", "OPENFOAM_VERSION": "13"}
        
        result = flask_app.save_config(updates)
        assert result is True

        # Check file exists and contents include updates merged with loaded config
        with config_file.open("r", encoding="utf-8") as f:
            saved_data = json.load(f)
            assert saved_data["CASE_ROOT"] == "/default/path"
            assert saved_data["DOCKER_IMAGE"] == "new-image:latest"
            assert saved_data["OPENFOAM_VERSION"] == "13"

def test_save_config_oserror(monkeypatch):
    # Simulate OSError on file open
    with patch('pathlib.Path.open', side_effect=OSError("Disk full")), \
         patch('app.CONFIG_FILE', Path('dummy_path.json')), \
         patch('app.load_config', return_value={"CASE_ROOT": "/default"}), \
         patch('app.logger') as mock_logger:
        
        updates = {"DOCKER_IMAGE": "fail-image"}
        result = flask_app.save_config(updates)
        assert result is False
        # Verify error logged
        mock_logger.error.assert_called()

def test_save_config_typeerror(monkeypatch):
    # Simulate TypeError on json.dump (e.g., unserializable type)
    # We can't easily mock json.dump inside the with block without mocking open context manager
    # returning a mock file object.

    mock_file = MagicMock()
    # When dump tries to write to this mock file, it will succeed,
    # but we want json.dump to raise TypeError.
    # Actually, easier to pass unserializable object in updates.

    with patch('app.CONFIG_FILE', Path('dummy.json')), \
         patch('pathlib.Path.open', mock_open()), \
         patch('app.load_config', return_value={"CASE_ROOT": "/default"}), \
         patch('app.logger') as mock_logger:

        updates = {"DOCKER_IMAGE": object()}  # object() is unserializable
        result = flask_app.save_config(updates)
        assert result is False
        mock_logger.error.assert_called()

def test_get_case_root(client):
    """Test the get_case_root endpoint."""
    response = client.get('/get_case_root')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'caseDir' in data
    # caseDir might be None initially or string
    if data['caseDir'] is not None:
        assert isinstance(data['caseDir'], str)


def test_set_case(client, tmp_path):
    """Test the set_case endpoint."""
    test_path = tmp_path / "test_case_dir"
    # The endpoint now resolves the path, so we expect absolute path
    expected_path = str(test_path.resolve())

    # Patch save_config to avoid writing to actual config file location
    with patch('app.save_config', return_value=True):
        response = client.post(
            '/set_case',
            data=json.dumps({'caseDir': str(test_path)}),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'caseDir' in data
        assert data['caseDir'] == expected_path
        assert Path(expected_path).exists()


def test_get_docker_config(client):
    """Test the get_docker_config endpoint."""
    response = client.get('/get_docker_config')
    assert response.status_code == 200
    data = json.loads(response.data)
    # Updated to match actual response keys
    assert 'dockerImage' in data
    assert 'openfoamVersion' in data
    # Can be None if not set
    if data['dockerImage']:
        assert isinstance(data['dockerImage'], str)
    if data['openfoamVersion']:
        assert isinstance(data['openfoamVersion'], str)


def test_set_docker_config(client):
    """Test the set_docker_config endpoint."""
    test_config = {
        'dockerImage': 'test-image:latest',
        'openfoamVersion': 'test-version'
    }
    with patch('app.save_config', return_value=True):
        response = client.post(
            '/set_docker_config',
            data=json.dumps(test_config),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        # Updated to match actual response structure
        assert 'dockerImage' in data
        assert 'openfoamVersion' in data
        assert data['dockerImage'] == test_config['dockerImage']
        assert data['openfoamVersion'] == test_config['openfoamVersion']


def test_load_tutorial_missing_parameter(client):
    """Test load_tutorial with missing tutorial parameter."""
    response = client.post(
        '/load_tutorial',
        data=json.dumps({}),  # Empty JSON
        content_type='application/json'
    )
    assert response.status_code == 200 # It returns 200 with error message in current impl
    data = json.loads(response.data)
    assert 'output' in data
    assert 'Error' in data['output']
    assert 'No tutorial selected' in data['output']


def test_run_case_missing_parameters(client):
    """Test run_case with missing parameters."""
    response = client.post(
        '/run',
        data=json.dumps({}),  # Empty JSON
        content_type='application/json'
    )
    assert response.status_code == 400
    data = json.loads(response.data)
    assert 'error' in data


class TestDockerEndpoints:
    """Test Docker-related endpoints with mocked Docker client."""
    
    def test_docker_unavailable(self, client, monkeypatch):
        """Test behavior when Docker is not available."""
        def mock_docker_client():
            return None
            
        monkeypatch.setattr(flask_app, 'get_docker_client', mock_docker_client)
        
        # Test an endpoint that requires Docker
        response = client.post(
            '/load_tutorial',
            data=json.dumps({'tutorial': 'test'}),
            content_type='application/json'
        )
        assert response.status_code == 503
        data = json.loads(response.data)
        assert 'output' in data  # The actual response contains 'output' not 'error'
        assert 'Docker' in data['output']  # Should mention Docker in the output

    def test_get_docker_client_success(monkeypatch):
        mock_client = MagicMock()
        mock_client.ping.return_value = True

        with patch('app.docker.from_env', return_value=mock_client):
            # Reset cached client
            flask_app.docker_client = None

            client = flask_app.get_docker_client()
            # Should return the client instance
            assert client == mock_client
            mock_client.ping.assert_called_once()

    def test_get_docker_client_cached(monkeypatch):
        # Setup a cached client in global variable
        mock_client = MagicMock()
        flask_app.docker_client = mock_client

        client = flask_app.get_docker_client()
        # Should return the cached client directly without calling docker.from_env
        assert client == mock_client

    def test_get_docker_client_docker_exception(monkeypatch):
        # Mock docker.from_env to raise DockerException (simulate Docker not running)
        with patch('app.docker.from_env', side_effect=DockerException("Connection error")), \
            patch('app.logger') as mock_logger:
            
            # Reset cached client
            flask_app.docker_client = None
            
            client = flask_app.get_docker_client()
            assert client is None
            # Confirm error was logged mentioning Docker daemon not available
            mock_logger.error.assert_called()
            call_args = mock_logger.error.call_args[0][0]
            assert "Docker daemon not available" in call_args

class TestPlottingEndpoints:
    """Test plotting-related endpoints."""
    
    def test_api_available_fields(self, client, tmp_path):
        # Create the tutorial directory expected by the endpoint
        tutorial_dir = tmp_path / "test_tutorial"
        tutorial_dir.mkdir(parents=True, exist_ok=True)

        with patch('app.CASE_ROOT', str(tmp_path)), \
             patch('app.get_available_fields', return_value=['U', 'p']):
            response = client.get('/api/available_fields?tutorial=test_tutorial')
            assert response.status_code == 200
            data = response.get_json()
            assert 'fields' in data
            assert 'U' in data['fields']
            assert 'p' in data['fields']

    def test_api_available_fields_mocked(self, client):
        with patch('os.stat') as mock_stat, \
             patch('app.get_available_fields', return_value=['U', 'p']):
            mock_stat.return_value.st_mtime = 12345.0
            response = client.get('/api/available_fields?tutorial=test_tutorial')
            assert response.status_code == 200
            data = response.get_json()
            assert 'fields' in data
            assert 'U' in data['fields']

    def test_api_plot_data_mocked(self, client):
        mock_parser = MagicMock()
        mock_parser.get_all_time_series_data.return_value = {'time': [0.1], 'data': {'U': [1, 2, 3]}}
        with patch('os.stat') as mock_stat, \
             patch('app.OpenFOAMFieldParser', return_value=mock_parser):
            mock_stat.return_value.st_mtime = 12345.0
            response = client.get('/api/plot_data?tutorial=test_tutorial')
            assert response.status_code == 200
            data = response.get_json()
            assert 'time' in data
            assert 'data' in data


def test_api_residuals(client, tmp_path):
    """Test the api_residuals endpoint."""
    # Create tutorial dir expected by the endpoint
    tutorial_dir = tmp_path / "test_tutorial"
    tutorial_dir.mkdir(parents=True, exist_ok=True)

    # Test with mock
    with patch('app.CASE_ROOT', str(tmp_path)), \
         patch('os.stat') as mock_os_stat, \
         patch('app.OpenFOAMFieldParser') as mock_parser_cls, \
         patch('app.check_cache') as mock_check_cache:
        mock_os_stat.return_value.st_mtime = 12345.0
        # Setup mock parser
        mock_parser = MagicMock()
        mock_parser.get_residuals_from_log.return_value = {
            'time': [0.1],
            'residuals': {
                'Ux': [0.1],
                'Uy': [0.2],
                'Uz': [0.3]
            }
        }
        mock_parser_cls.return_value = mock_parser

        # Setup mock check_cache to simulate file existence
        # Returns: (is_not_modified, last_modified_str, stat_result)
        mock_stat = MagicMock()
        mock_stat.st_mtime = 12345.0
        mock_stat.st_size = 100
        mock_check_cache.return_value = (False, "Wed, 21 Oct 2015 07:28:00 GMT", mock_stat)

        # Make the request
        response = client.get('/api/residuals?tutorial=test_tutorial')
        assert response.status_code == 200
        data = response.get_json()
        
        # Verify response structure
        assert 'time' in data
        assert 'residuals' in data
        assert 'Ux' in data['residuals']
        assert 'Uy' in data['residuals']
        assert 'Uz' in data['residuals']

        # Verify the mock was called with correct path
        expected_case_dir = str(tmp_path / "test_tutorial")
        mock_parser_cls.assert_called_once_with(expected_case_dir)
        mock_parser.get_residuals_from_log.assert_called_once()

         # Test 2: No tutorial specified
        response = client.get('/api/residuals')
        assert response.status_code == 400
        data = response.get_json()
        assert 'error' in data
        assert data['error'] == "No tutorial specified"

        # Test 3: Case directory not found
        response = client.get('/api/residuals?tutorial=non_existent_tutorial')
        assert response.status_code == 404
        data = response.get_json()
        assert 'error' in data
        assert data['error'] == "Case directory not found"

        # Test 4: Parser raises an exception
        with patch('app.OpenFOAMFieldParser') as mock_parser_cls:
            mock_parser = MagicMock()
            mock_parser.get_residuals_from_log.side_effect = Exception("Test error")
            mock_parser_cls.return_value = mock_parser

            # Create the tutorial directory for this test
            tutorial_dir.mkdir(parents=True, exist_ok=True)

            response = client.get('/api/residuals?tutorial=test_tutorial')
            assert response.status_code == 500
            data = response.get_json()
            assert 'error' in data
            # Updated to expect sanitized error message
            assert data['error'] == "An internal server error occurred."

def test_api_latest_data(client, tmp_path):
    """Test the api_latest_data endpoint with various scenarios."""
    # Setup common test data
    tutorial_dir = tmp_path / "test_tutorial"
    tutorial_dir.mkdir(parents=True, exist_ok=True)  # Create the folder expected by the API

    # Test 1: Test successful response
    with patch('app.CASE_ROOT', str(tmp_path)), \
         patch('app.OpenFOAMFieldParser') as mock_parser_cls:
        # Setup mock parser
        mock_parser = MagicMock()
        mock_parser.get_latest_time_data.return_value = {
            'time': 1.0,
            'fields': ['U', 'p'],
            'boundaryField': {'inlet': {'type': 'patch'}}
        }
        mock_parser_cls.return_value = mock_parser

        # Make the request
        response = client.get('/api/latest_data?tutorial=test_tutorial')
        assert response.status_code == 200
        data = response.get_json()
        
        # Verify response structure
        assert 'time' in data
        assert 'fields' in data
        assert 'boundaryField' in data
        assert 'inlet' in data['boundaryField']

        # Verify the mock was called with correct path
        expected_case_dir = str(tmp_path / "test_tutorial")
        mock_parser_cls.assert_called_once_with(expected_case_dir)
        mock_parser.get_latest_time_data.assert_called_once()

    # Test 2: No tutorial specified
    response = client.get('/api/latest_data')
    assert response.status_code == 400
    data = response.get_json()
    assert 'error' in data
    assert data['error'] == "No tutorial specified"

    # Test 3: Case directory not found
    with patch('app.CASE_ROOT', str(tmp_path)):
        response = client.get('/api/latest_data?tutorial=non_existent_tutorial')
        assert response.status_code == 404
        data = response.get_json()
        assert 'error' in data
        assert data['error'] == "Case directory not found"

    # Test 4: Parser raises an exception
    with patch('app.CASE_ROOT', str(tmp_path)), \
         patch('app.OpenFOAMFieldParser') as mock_parser_cls:
        mock_parser = MagicMock()
        mock_parser.get_latest_time_data.side_effect = Exception("Test error")
        mock_parser_cls.return_value = mock_parser

        # Create the tutorial directory for this test
        tutorial_dir.mkdir(parents=True, exist_ok=True)

        response = client.get('/api/latest_data?tutorial=test_tutorial')
        assert response.status_code == 500
        data = response.get_json()
        assert 'error' in data
        # Updated to expect sanitized error message
        assert data['error'] == "An internal server error occurred."

    # Test 5: Empty data returned from parser
    with patch('app.CASE_ROOT', str(tmp_path)), \
         patch('app.OpenFOAMFieldParser') as mock_parser_cls:
        mock_parser = MagicMock()
        mock_parser.get_latest_time_data.return_value = None
        mock_parser_cls.return_value = mock_parser

        response = client.get('/api/latest_data?tutorial=test_tutorial')
        assert response.status_code == 200
        data = response.get_json()
        assert data == {}  # Should return empty dict when no data   

def test_run_case(client, tmp_path):
    """Test the run_case endpoint with various scenarios."""
    # Setup test data
    tutorial = "test_tutorial"
    case_dir = str(tmp_path / tutorial)
    (tmp_path / tutorial).mkdir(exist_ok=True)
    
    # Test 1: Missing command
    response = client.post('/run', json={
        "tutorial": tutorial,
        "caseDir": case_dir
    })
    assert response.status_code == 400
    data = response.get_json()
    assert "error" in data
    assert "No command provided" in data["error"]

    # Test 2: Missing tutorial or caseDir
    response = client.post('/run', json={
        "command": "blockMesh",
        "caseDir": case_dir
    })
    assert response.status_code == 400
    data = response.get_json()
    assert "error" in data
    assert "Missing tutorial or caseDir" in data["error"]

    # Test 3: Unsafe command
    with patch('app.is_safe_command', return_value=False), \
         patch('app.get_docker_client', return_value=MagicMock()), \
         patch('app.CASE_ROOT', str(tmp_path)):  # Patch CASE_ROOT to allow validation
        response = client.post('/run', json={
            "tutorial": tutorial,
            "caseDir": case_dir,
            "command": "rm -rf /"
        })
        assert response.status_code == 200
        assert b"Unsafe command detected" in response.data

    # Test 4: OpenFOAM command (success case)
    with patch('app.get_docker_client') as mock_docker, \
         patch('app.threading.Thread') as mock_thread, \
         patch('app.CASE_ROOT', str(tmp_path)):  # Patch CASE_ROOT to allow validation
        # Setup mock Docker client
        mock_client = MagicMock()
        mock_container = MagicMock()
        mock_container.logs.return_value = [b"blockMesh output line 1\n", b"blockMesh output line 2\n"]
        mock_client.containers.run.return_value = mock_container
        mock_docker.return_value = mock_client

        response = client.post('/run', json={
            "tutorial": tutorial,
            "caseDir": case_dir,
            "command": "blockMesh"
        })
        
        assert response.status_code == 200
        assert b"blockMesh output line 1" in response.data
        assert b"blockMesh output line 2" in response.data

    # Test 5: Script execution
    with patch('app.get_docker_client') as mock_docker, \
         patch('app.is_safe_script_name', return_value=True), \
         patch('app.threading.Thread') as mock_thread, \
         patch('app.CASE_ROOT', str(tmp_path)):  # Patch CASE_ROOT to allow validation
        # Setup mock Docker client
        mock_client = MagicMock()
        mock_container = MagicMock()
        mock_container.logs.return_value = [b"Script output\n"]
        mock_client.containers.run.return_value = mock_container
        mock_docker.return_value = mock_client

        response = client.post('/run', json={
            "tutorial": tutorial,
            "caseDir": case_dir,
            "command": "./test_script.sh"
        })
        
        assert response.status_code == 200
        assert b"Script output" in response.data

    # Test 6: Docker not available
    with patch('app.get_docker_client', return_value=None), \
         patch('app.CASE_ROOT', str(tmp_path)):  # Patch CASE_ROOT to allow validation
        response = client.post('/run', json={
            "tutorial": tutorial,
            "caseDir": case_dir,
            "command": "blockMesh"
        })
        assert response.status_code == 200
        assert b"Docker daemon not available" in response.data

def test_run_case_fallback_script(client, tmp_path):
    """Test the run_case endpoint with a fallback script execution."""
    # Setup test data
    tutorial = "test_tutorial"
    case_dir = str(tmp_path / tutorial)
    (tmp_path / tutorial).mkdir(exist_ok=True)
    
    # Test 1: Valid script name
    with patch('app.get_docker_client') as mock_docker, \
         patch('app.threading.Thread') as mock_thread, \
         patch('app.CASE_ROOT', str(tmp_path)):  # Patch CASE_ROOT to allow validation
        # Setup mock Docker client
        mock_client = MagicMock()
        mock_container = MagicMock()
        mock_container.logs.return_value = [b"Fallback script output\n"]
        mock_client.containers.run.return_value = mock_container
        mock_docker.return_value = mock_client

        response = client.post('/run', json={
            "tutorial": tutorial,
            "caseDir": case_dir,
            "command": "custom_script"  # No './' prefix, not an OpenFOAM command
        })
        
        assert response.status_code == 200
        assert b"Fallback script output" in response.data
        
        # Verify the container was created with the correct command
        args, kwargs = mock_client.containers.run.call_args
        assert args[0] == flask_app.DOCKER_IMAGE
        
        # Get the actual command that was passed to bash -c
        bash_command = args[1]  # The command is the second positional argument
        assert "bash" in bash_command[0]  # First part should be 'bash'
        assert "-c" in bash_command  # Should include -c flag
        wrapper_script = bash_command[2]  # The script is the third part after 'bash' and '-c'
        
        # Verify the wrapper script contains the expected commands
        # Update assertions to match new secure positional argument format
        # bash -c '... && chmod +x "$3" && ./"$3"'
        assert "chmod +x \"$3\"" in wrapper_script
        assert "./\"$3\"" in wrapper_script

        # Verify custom_script is passed as argument
        assert "custom_script" in args[1]

    # Test 2: Unsafe script name
    with patch('app.is_safe_command', return_value=True), \
         patch('app.is_safe_script_name', return_value=False), \
         patch('app.get_docker_client', return_value=MagicMock()), \
         patch('app.CASE_ROOT', str(tmp_path)):  # Patch CASE_ROOT to allow validation
        response = client.post('/run', json={
            "tutorial": tutorial,
            "caseDir": case_dir,
            "command": "unsafe script.sh"  # safe command but invalid script name
        })
        assert response.status_code == 200
        assert b"Unsafe command name" in response.data
        assert b"must be alphanumeric" in response.data

    # Test 3: Verify script execution with environment setup
    with patch('app.get_docker_client') as mock_docker, \
         patch('app.threading.Thread') as mock_thread, \
         patch('app.CASE_ROOT', str(tmp_path)):  # Patch CASE_ROOT to allow validation
        mock_client = MagicMock()
        mock_container = MagicMock()
        mock_container.logs.return_value = [b"Script with env\n"]
        mock_client.containers.run.return_value = mock_container
        mock_docker.return_value = mock_client

        response = client.post('/run', json={
            "tutorial": tutorial,
            "caseDir": case_dir,
            "command": "setup_environment"
        })
        
        # Verify the container was created with the correct command
        args, _ = mock_client.containers.run.call_args
        bash_command = args[1]
        wrapper_script = bash_command[2]  # The script is the third part after 'bash' and '-c'
        
        # Verify the bash script includes necessary setup via positional args
        assert "source \"$1\"" in wrapper_script
        assert "cd \"$2\"" in wrapper_script
        assert "chmod +x \"$3\"" in wrapper_script
        assert "./\"$3\"" in wrapper_script

        # Verify the actual values passed as arguments
        # args[1] is the docker command list
        assert "/opt/" in args[1][4]  # $1 is bashrc
        assert "/tmp/FOAM_Run" in args[1][5] # $2 is container_case_path
        assert "setup_environment" in args[1][6] # $3 is script name

def test_run_case_unsafe_script_name(client, tmp_path):
    """Test the run_case endpoint with an unsafe script name."""
    # Setup test data
    tutorial = "test_tutorial"
    case_dir = str(tmp_path / tutorial)
    (tmp_path / tutorial).mkdir(exist_ok=True)
    
    # Mock is_safe_command to return True (so we can test script name validation)
    with patch('app.is_safe_command', return_value=True), \
         patch('app.is_safe_script_name', return_value=False), \
         patch('app.get_docker_client', return_value=MagicMock()), \
         patch('app.CASE_ROOT', str(tmp_path)):  # Patch CASE_ROOT to allow validation
        
        # Test with a script that has an unsafe name
        unsafe_script = "malicious_script.sh"
        response = client.post('/run', json={
            "tutorial": tutorial,
            "caseDir": case_dir,
            "command": f"./{unsafe_script}"  # Script with unsafe name
        })
        
        # Verify the response
        assert response.status_code == 200
        response_data = response.data.decode('utf-8')
        assert f"Unsafe script name: {unsafe_script}" in response_data
        assert "Script names must be alphanumeric with underscores/hyphens only" in response_data

def test_run_case_container_cleanup(client, tmp_path):
    """Test that containers are properly cleaned up in case of errors."""
    tutorial = "test_tutorial"
    case_dir = str(tmp_path / tutorial)
    (tmp_path / tutorial).mkdir(exist_ok=True)
    
    with patch('app.get_docker_client') as mock_docker, \
         patch('app.threading.Thread') as mock_thread, \
         patch('app.CASE_ROOT', str(tmp_path)):  # Patch CASE_ROOT to allow validation
        # Setup mock container that will raise an exception when reading logs
        mock_container = MagicMock()
        mock_container.logs.side_effect = Exception("Simulated error during execution")
        mock_container.kill.return_value = None
        mock_container.remove.return_value = None
        
        # Setup mock client
        mock_client = MagicMock()
        mock_client.containers.run.return_value = mock_container
        mock_docker.return_value = mock_client

        # Make the request - this should trigger the error in the log streaming
        response = client.post('/run', json={
            "tutorial": tutorial,
            "caseDir": case_dir,
            "command": "blockMesh"
        })
        
        # Exhaust the streaming response content to ensure generator runs fully
        response_data = b''.join(response.response)
        response_text = response_data.decode('utf-8')
        
        # Verify the container was killed and removed
        mock_container.kill.assert_called_once()
        mock_container.remove.assert_called_once()
        
        # Verify the error was logged
        mock_container.logs.assert_called_once_with(stream=True)
        
        # The response should be 200, streaming the error message
        assert response.status_code == 200
        
        # Check for the error message in the response
        assert "Simulated error during execution" in response_text, \
            f"Expected error message not found in response: {response_text}"

def test_run_case_container_cleanup_with_errors(client, tmp_path):
    """Test container cleanup when kill/remove operations fail."""
    tutorial = "test_tutorial"
    case_dir = str(tmp_path / tutorial)
    (tmp_path / tutorial).mkdir(exist_ok=True)
    
    with patch('app.get_docker_client') as mock_docker, \
         patch('app.threading.Thread') as mock_thread, \
         patch('app.logger') as mock_logger, \
         patch('app.CASE_ROOT', str(tmp_path)):  # Patch CASE_ROOT to allow validation
        # Setup mock container that raises exception on logs
        mock_container = MagicMock()
        mock_container.logs.side_effect = Exception("Simulated error")
        mock_container.kill.side_effect = Exception("Kill failed")
        mock_container.remove.side_effect = Exception("Remove failed")
        
        # Setup mock client returning the container
        mock_client = MagicMock()
        mock_client.containers.run.return_value = mock_container
        mock_docker.return_value = mock_client

        # Make the request
        response = client.post('/run', json={
            "tutorial": tutorial,
            "caseDir": case_dir,
            "command": "blockMesh"
        })
        
        # Exhaust the streaming response content to ensure generator runs fully
        response_data = b''.join(response.response)
        response_text = response_data.decode('utf-8')
        
        # Verify kill and remove attempts (even though they raise errors)
        mock_container.kill.assert_called_once()
        mock_container.remove.assert_called_once()
        
        # Verify error logs were recorded for kill and remove failures
        error_messages = [call[0][0] for call in mock_logger.error.call_args_list]
        debug_messages = [call[0][0] for call in mock_logger.debug.call_args_list]

        assert any("Could not kill container" in str(msg) for msg in debug_messages)
        assert any("Could not remove container" in str(msg) for msg in error_messages)
        
        # The response should be 200, streaming the error message from logs exception
        assert response.status_code == 200
        
        # Check for either the old or new error message format
        assert any(msg in response_text for msg in [
            "Failed to stream container logs",
                "Error getting container logs",
                "Log stream interrupted"
        ]), f"Expected error message not found in response: {response_text}"

# Contour-related tests

def test_create_contour_options_returns_204(client):
    response = client.options('/api/contours/create')
    assert response.status_code == 204
    assert response.data == b""

def test_create_contour_requires_json(client):
    response = client.post('/api/contours/create', data="notjson", content_type='text/plain')
    assert response.status_code == 400
    data = response.get_json()
    assert not data["success"]
    assert "Expected JSON" in data["error"]

def test_create_contour_missing_tutorial(client):
    response = client.post('/api/contours/create', json={"caseDir": "/path"})
    assert response.status_code == 400
    data = response.get_json()
    assert not data["success"]
    assert "Tutorial not specified" in data["error"]

def test_create_contour_missing_caseDir(client):
    response = client.post('/api/contours/create', json={"tutorial": "tutorial_name"})
    assert response.status_code == 400
    data = response.get_json()
    assert not data["success"]
    assert "Case directory not specified" in data["error"]

def test_create_contour_case_dir_not_found(client, tmp_path):
    # Provide relative caseDir which does not exist under CASE_ROOT
    rel_case_dir = "nonexistent_case"
    
    with patch('app.CASE_ROOT', str(tmp_path)):
        response = client.post('/api/contours/create', json={
            "tutorial": "tutorial_name",
            "caseDir": rel_case_dir
        })
        assert response.status_code == 404
        data = response.get_json()
        assert not data["success"]
        assert "Case directory not found" in data["error"]

def test_create_contour_no_vtk_files(client, tmp_path):
    tutorial_dir = tmp_path / "existing_case"
    tutorial_dir.mkdir()
    
    with patch('app.CASE_ROOT', str(tmp_path)):
        response = client.post('/api/contours/create', json={
            "tutorial": "tutorial_name",
            "caseDir": str(tutorial_dir)
        })
        assert response.status_code == 404
        data = response.get_json()
        assert not data["success"]
        assert "No VTK files found" in data["error"]

def test_create_contour_load_mesh_failure(client, tmp_path):
    tutorial_dir = tmp_path / "case_with_vtk"
    tutorial_dir.mkdir()
    vtk_file = tutorial_dir / "mesh.vtk"
    vtk_file.write_text("dummy data")
    
    # Mock the load_mesh function
    mock_load_mesh = MagicMock(return_value={"success": False, "error": "Load failed"})
    
    with patch.dict('sys.modules', {'isosurface_visualizer': MagicMock(load_mesh=mock_load_mesh)}):
        with patch('app.CASE_ROOT', str(tmp_path)), \
             patch('backend.post.isosurface.isosurface_visualizer.load_mesh', return_value={"success": False, "error": "Load failed"}):
            response = client.post('/api/contours/create', json={
                "tutorial": "tutorial_name",
                "caseDir": str(tutorial_dir)
            })
            assert response.status_code == 500
            data = response.get_json()
            assert not data["success"]
            assert "Failed to load mesh" in data["error"]

def test_create_contour_scalar_field_not_found(client, tmp_path):
    tutorial_dir = tmp_path / "test_tutorial"
    tutorial_dir.mkdir(parents=True, exist_ok=True)
    (vtk_file := tutorial_dir / "mesh.vtk").write_text("dummy VTK content")

    # Mock load_mesh returns success but missing requested scalar field 
    mesh_info = {
    "success": True,
    "n_points": 1000,
    "point_arrays": ["U", "p"]  # requested scalar field intentionally missing
}
    with patch('app.CASE_ROOT', str(tmp_path)), \
        patch('backend.post.isosurface.isosurface_visualizer.load_mesh', return_value=mesh_info):

        response = client.post('/api/contours/create', json={
            "tutorial": "test_tutorial",
            "caseDir": str(tutorial_dir),
            "scalar_field": "nonexistent_field"
        })
        assert response.status_code == 400
        data = response.get_json()
        assert not data["success"]
        assert "Scalar field" in data["error"]

def test_create_contour_success(client, tmp_path):
    tutorial_dir = tmp_path / "test_tutorial"
    tutorial_dir.mkdir(parents=True, exist_ok=True)
    (vtk_file := tutorial_dir / "mesh.vtk").write_text("dummy VTK content")

    mesh_info = {
    "success": True,
    "n_points": 1000,
    "point_arrays": ["U_Magnitude", "U", "p"]
    }

    fake_viz_info = {
        "mode": "iframe",
        "src": "http://localhost:1234/index.html",
        "port": 1234
    }

    with patch('app.CASE_ROOT', str(tmp_path)), \
        patch('backend.post.isosurface.isosurface_visualizer.load_mesh', return_value=mesh_info), \
        patch('backend.post.isosurface.isosurface_visualizer.start_trame_visualization', return_value=fake_viz_info):

        response = client.post('/api/contours/create', json={
            "tutorial": "test_tutorial",
            "caseDir": str(tutorial_dir),
            "scalar_field": "U_Magnitude",
            "num_isosurfaces": 7,
            "range": [0, 10]
        })
        assert response.status_code == 200
        assert response.mimetype == "application/json"
        data = response.get_json()
        assert data["mode"] == "iframe"
        assert data["src"] == "http://localhost:1234/index.html"


def test_main_startup(monkeypatch, tmp_path):
    fake_config = {
        "CASE_ROOT": str(tmp_path / "fake_case_root"),
        "DOCKER_IMAGE": "fake/image",
        "OPENFOAM_VERSION": "vX"
    }
    with patch('app.load_config', return_value=fake_config), \
         patch('pathlib.Path.mkdir') as mkdir_mock, \
         patch('app.app.run') as run_mock:

        flask_app.main()

        mkdir_mock.assert_called()
        run_mock.assert_called_once_with(host="127.0.0.1", port=5000, debug=False, threaded=True)

def test_run_case_no_thread_started(client, tmp_path):
    """Test that run_case does NOT start a background thread for log monitoring."""
    tutorial = "test_tutorial"
    case_dir = str(tmp_path / tutorial)
    (tmp_path / tutorial).mkdir(exist_ok=True)

    with patch('app.get_docker_client') as mock_docker, \
         patch('app.threading.Thread') as mock_thread, \
         patch('app.CASE_ROOT', str(tmp_path)):

        mock_client = MagicMock()
        mock_container = MagicMock()
        mock_container.logs.return_value = [b"Output\n"]
        mock_client.containers.run.return_value = mock_container
        mock_docker.return_value = mock_client

        response = client.post('/run', json={
            "tutorial": tutorial,
            "caseDir": case_dir,
            "command": "blockMesh"
        })

        assert response.status_code == 200

        # Verify that threading.Thread was NOT called
        mock_thread.assert_not_called()
