import os
import json
import time
import logging
import shutil
import docker
from pathlib import Path
from flask import Flask, request, jsonify, render_template_string, Response, stream_with_context

# Initialize Flask app
app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FOAMLib")

# Default configuration
DEFAULT_CONFIG = {
    "case_dir": "",
    "docker_image": "haldardhruv/ubuntu_noble_openfoam:v2412",
    "openfoam_version": "2412"
}

# Initialize Docker client
try:
    docker_client = docker.from_env()
    docker_client.ping()
except Exception as e:
    logger.error(f"Docker not available: {e}")
    docker_client = None

# Ensure required directories exist
Path("runs").mkdir(exist_ok=True)
Path("tutorials").mkdir(exist_ok=True)

# Load or create config
def load_config():
    try:
        if os.path.exists("config.json"):
            with open("config.json", "r") as f:
                return {**DEFAULT_CONFIG, **json.load(f)}
    except Exception as e:
        logger.error(f"Error loading config: {e}")
    return DEFAULT_CONFIG.copy()

def save_config():
    try:
        with open("config.json", "w") as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        logger.error(f"Error saving config: {e}")

# Load initial config
config = load_config()

# --- Helper Functions ---

def get_tutorial_case_dir(tutorial_name):
    """Get the path to a tutorial case directory"""
    return os.path.join("tutorials", tutorial_name)

def create_run_directory():
    """Create a new run directory with timestamp"""
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    run_dir = os.path.join("runs", f"run_{timestamp}")
    os.makedirs(run_dir, exist_ok=True)
    return run_dir

def run_openfoam_command(case_dir, command):
    """Run an OpenFOAM command in a Docker container"""
    if not docker_client:
        yield "Error: Docker is not available\n"
        return
    
    try:
        # Prepare the command
        bashrc_path = "/usr/lib/openfoam/openfoam2412/etc/bashrc"
        full_command = f'source {bashrc_path} && cd /case && {command}'
        
        # Run the container
        container = docker_client.containers.run(
            config["docker_image"],
            command=["bash", "-c", full_command],
            volumes={
                os.path.abspath(case_dir): {"bind": "/case", "mode": "rw"}
            },
            environment={
                "FOAM_USER_RUN": "/tmp",
                "WM_PROJECT_DIR": "/usr/lib/openfoam/openfoam2412"
            },
            detach=True,
            remove=False,
            tty=True,
            user="root",
            mem_limit='4g',
            memswap_limit='4g'
        )
        
        # Stream the output
        for line in container.logs(stream=True, follow=True):
            yield line.decode('utf-8')
            
        # Clean up
        container.remove(force=True)
        
    except Exception as e:
        yield f"Error running command: {str(e)}\n"

def get_available_tutorials():
    """Get list of available tutorials"""
    tutorials = []
    tutorials_dir = os.path.join(os.path.dirname(__file__), "tutorials")
    if os.path.exists(tutorials_dir):
        tutorials = [d for d in os.listdir(tutorials_dir) 
                    if os.path.isdir(os.path.join(tutorials_dir, d))]
    return sorted(tutorials)

# HTML Template
HTML_TEMPLATE = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FOAMLib</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#3b82f6',
            secondary: '#6b7280'
          }
        }
      }
    }
  </script>
</head>
<body class="bg-gray-50 text-gray-800 min-h-screen p-4 sm:p-6">
  <div class="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-6 flex flex-col gap-6">
    <!-- Header -->
    <div class="text-center">
      <h1 class="text-3xl sm:text-4xl font-bold text-primary">FOAMLib</h1>
      <p class="text-gray-600">OpenFOAM Simulation Interface</p>
    </div>

    <!-- Case Directory -->
    <div class="flex flex-col sm:flex-row sm:items-center gap-2">
      <input type="text" id="caseDir" value="{{ config.case_dir }}" 
             class="border border-gray-300 rounded px-3 py-2 flex-1 w-full" 
             placeholder="Case directory path" />
      <button onclick="setCase()" 
              class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded w-full sm:w-auto">
        Set Case Directory
      </button>
    </div>

    <!-- Docker Config -->
    <div class="border border-gray-200 rounded-lg p-4">
      <h3 class="font-semibold text-lg mb-2">Docker Configuration</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="md:col-span-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">Docker Image</label>
          <input type="text" id="dockerImage" value="{{ config.docker_image }}" 
                 class="w-full border border-gray-300 rounded px-3 py-2" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">OpenFOAM Version</label>
          <input type="text" id="openfoamVersion" value="{{ config.openfoam_version }}" 
                 class="w-full border border-gray-300 rounded px-3 py-2" />
        </div>
      </div>
      <button onclick="setDockerConfig()" 
              class="mt-3 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded">
        Update Docker Config
      </button>
    </div>

    <!-- Tutorial Selection -->
    <div class="border border-gray-200 rounded-lg p-4">
      <h3 class="font-semibold text-lg mb-2">Tutorials</h3>
      <div class="flex flex-col sm:flex-row gap-2">
        <select id="tutorialSelect" class="border border-gray-300 rounded px-3 py-2 flex-1">
          {% for tutorial in tutorials %}
          <option value="{{ tutorial }}">{{ tutorial }}</option>
          {% endfor %}
        </select>
        <button onclick="loadTutorial()" 
                class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded w-full sm:w-auto">
          Load Tutorial
        </button>
      </div>
    </div>

    <!-- Command Buttons -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <button data-command="blockMesh" 
              class="command-btn bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded">
        blockMesh
      </button>
      <button data-command="simpleFoam" 
              class="command-btn bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded">
        simpleFoam
      </button>
      <button data-command="pimpleFoam" 
              class="command-btn bg-pink-500 hover:bg-pink-600 text-white px-4 py-2 rounded">
        pimpleFoam
      </button>
      <button data-command="./Allrun" 
              class="command-btn bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded">
        Run All
      </button>
    </div>

    <!-- Output -->
    <div class="border border-gray-200 rounded-lg p-4">
      <div class="flex justify-between items-center mb-2">
        <h3 class="font-semibold text-lg">Output</h3>
        <button onclick="clearOutput()" 
                class="text-sm text-gray-500 hover:text-gray-700">
          Clear
        </button>
      </div>
      <div id="output" class="bg-gray-50 border border-gray-200 rounded p-3 h-64 overflow-auto text-sm font-mono">
        <!-- Output will appear here -->
      </div>
    </div>
  </div>

  <!-- JavaScript -->
  <script>
    // Debug logging
    console.log('Initializing FOAMLib...');
    
    // Global variables with default values
    let caseDir = "{{ config.case_dir }}" || '';
    let dockerImage = "{{ config.docker_image }}" || 'haldardhruv/ubuntu_noble_openfoam:v2412';
    let openfoamVersion = "{{ config.openfoam_version }}" || '2412';
    
    // Helper function to append output
    function appendOutput(message, type = 'stdout') {
      const container = document.getElementById('output');
      if (!container) {
        console.error('Output container not found');
        return;
      }
      
      const line = document.createElement('div');
      
      // Set line styling based on type
      if (type === 'stderr') {
        line.className = 'text-red-600';
      } else if (type === 'info') {
        line.className = 'text-blue-600';
      } else if (type === 'success') {
        line.className = 'text-green-600';
      } else {
        line.className = 'text-gray-800';
      }
      
      line.textContent = message;
      container.appendChild(line);
      container.scrollTop = container.scrollHeight;
    }
    
    // Clear output function
    function clearOutput() {
      const output = document.getElementById('output');
      if (output) output.innerHTML = '';
    }
    
    // Set case directory
    async function setCase() {
      console.log('setCase called');
      const caseDirInput = document.getElementById('caseDir');
      if (!caseDirInput) {
        const error = 'Error: Case directory input not found';
        console.error(error);
        appendOutput(error, 'stderr');
        return;
      }
      
      caseDir = caseDirInput.value.trim();
      if (!caseDir) {
        const error = 'Error: Please enter a case directory';
        console.error(error);
        appendOutput(error, 'stderr');
        return;
      }
      
      try {
        const response = await fetch('/set_case', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseDir })
        });
        
        const data = await response.json();
        if (data.status === 'success') {
          appendOutput(`Case directory set to: ${data.caseDir}`, 'success');
        } else {
          appendOutput(`Error: ${data.message || 'Failed to set case directory'}`, 'stderr');
        }
      } catch (error) {
        console.error('Error setting case directory:', error);
        appendOutput(`Error: ${error.message}`, 'stderr');
      }
    }
    
    // Set Docker configuration
    async function setDockerConfig() {
      const dockerImageInput = document.getElementById('dockerImage');
      const openfoamVersionInput = document.getElementById('openfoamVersion');
      
      if (!dockerImageInput || !openfoamVersionInput) {
        const error = 'Error: Docker configuration inputs not found';
        console.error(error);
        appendOutput(error, 'stderr');
        return;
      }
      
      dockerImage = dockerImageInput.value.trim();
      openfoamVersion = openfoamVersionInput.value.trim();
      
      if (!dockerImage) {
        const error = 'Error: Docker image is required';
        console.error(error);
        appendOutput(error, 'stderr');
        return;
      }
      
      try {
        const response = await fetch('/set_docker_config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dockerImage, openfoamVersion })
        });
        
        const data = await response.json();
        if (data.status === 'success') {
          appendOutput('Docker configuration updated successfully', 'success');
        } else {
          appendOutput(`Error: ${data.message || 'Failed to update Docker config'}`, 'stderr');
        }
      } catch (error) {
        console.error('Error setting docker config:', error);
        appendOutput(`Error: ${error.message}`, 'stderr');
      }
    }
    
    // Load tutorial
    async function loadTutorial() {
      const tutorialSelect = document.getElementById('tutorialSelect');
      if (!tutorialSelect) {
        const error = 'Error: Tutorial select element not found';
        console.error(error);
        appendOutput(error, 'stderr');
        return;
      }
      
      const tutorial = tutorialSelect.value;
      if (!tutorial) {
        appendOutput('Please select a tutorial', 'stderr');
        return;
      }
      
      try {
        const response = await fetch('/load_tutorial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tutorial })
        });
        
        const data = await response.json();
        if (data.status === 'success') {
          caseDir = data.caseDir;
          const caseDirInput = document.getElementById('caseDir');
          if (caseDirInput) caseDirInput.value = caseDir;
          appendOutput(`Tutorial loaded: ${tutorial}`, 'success');
          appendOutput(`Case directory set to: ${caseDir}`, 'info');
        } else {
          appendOutput(`Error: ${data.message || 'Failed to load tutorial'}`, 'stderr');
        }
      } catch (error) {
        console.error('Error loading tutorial:', error);
        appendOutput(`Error: ${error.message}`, 'stderr');
      }
    }
    
    // Run OpenFOAM command
    async function runCommand(command) {
      console.log('runCommand called with:', command);
      if (!command) {
        const error = 'Error: No command specified';
        console.error(error);
        appendOutput(error, 'stderr');
        return;
      }
      
      if (!caseDir) {
        const error = 'Error: No case directory set';
        console.error(error);
        appendOutput(error, 'stderr');
        return;
      }
      
      clearOutput();
      appendOutput(`Running: ${command} in ${caseDir}`, 'info');
      
      try {
        const response = await fetch('/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, caseDir })
        });
        
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || 'Failed to execute command');
        }
        
        if (!response.body) {
          throw new Error('No response body');
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer) {
              appendOutput(buffer, 'stdout');
            }
            appendOutput('Command completed', 'success');
            break;
          }
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim()) {
              const type = /error/i.test(line) ? 'stderr' : 'stdout';
              appendOutput(line, type);
            }
          }
        }
      } catch (error) {
        console.error('Command error:', error);
        appendOutput(`Error: ${error.message}`, 'stderr');
      }
    }
    
    // Initialize when the page loads
    document.addEventListener('DOMContentLoaded', function() {
      console.log('DOM fully loaded');
      
      // Set initial values
      const caseDirInput = document.getElementById('caseDir');
      const dockerImageInput = document.getElementById('dockerImage');
      const openfoamVersionInput = document.getElementById('openfoamVersion');
      
      if (caseDirInput) caseDirInput.value = caseDir || '';
      if (dockerImageInput) dockerImageInput.value = dockerImage || '';
      if (openfoamVersionInput) openfoamVersionInput.value = openfoamVersion || '';
      
      // Make functions globally available
      window.setCase = setCase;
      window.setDockerConfig = setDockerConfig;
      window.loadTutorial = loadTutorial;
      window.clearOutput = clearOutput;
      window.runCommand = runCommand;
      
      // Initialize buttons
      try {
        // Set Case button
        const setCaseBtn = document.querySelector('button[onclick*="setCase"]');
        if (setCaseBtn) {
          setCaseBtn.addEventListener('click', setCase);
          console.log('Set Case button initialized');
        }
        
        // Set Docker Config button
        const setDockerBtn = document.querySelector('button[onclick*="setDockerConfig"]');
        if (setDockerBtn) {
          setDockerBtn.addEventListener('click', setDockerConfig);
          console.log('Set Docker Config button initialized');
        }
        
        // Load Tutorial button
        const loadTutorialBtn = document.querySelector('button[onclick*="loadTutorial"]');
        if (loadTutorialBtn) {
          loadTutorialBtn.addEventListener('click', loadTutorial);
          console.log('Load Tutorial button initialized');
        }
        
        // Command buttons
        const commandBtns = document.querySelectorAll('.command-btn');
        console.log(`Found ${commandBtns.length} command buttons`);
        
        commandBtns.forEach(btn => {
          btn.addEventListener('click', function() {
            const command = this.getAttribute('data-command');
            console.log('Command button clicked:', command);
            runCommand(command);
          });
        });
        
        // Clear output button
        const clearBtn = document.querySelector('button[onclick*="clearOutput"]');
        if (clearBtn) {
          clearBtn.addEventListener('click', clearOutput);
          console.log('Clear Output button initialized');
        }
        
        console.log('All event listeners initialized');
      } catch (error) {
        console.error('Error initializing event listeners:', error);
      }
    });
  </script>
</body>
</html>

@app.route('/')
def index():
    """Render the main page"""
    tutorials = get_available_tutorials()
    return render_template_string(HTML_TEMPLATE, 
                               config=config,
                               tutorials=tutorials)

@app.route('/get_case_root')
def get_case_root():
    """Get the current case directory"""
    return jsonify({"caseDir": config.get("case_dir", "")})

@app.route('/get_docker_config')
def get_docker_config():
    """Get the current Docker configuration"""
    return jsonify({
        "dockerImage": config.get("docker_image", ""),
        "openfoamVersion": config.get("openfoam_version", "")
    })

@app.route('/set_case', methods=['POST'])
def set_case():
    """Set the current case directory"""
    data = request.get_json()
    case_dir = data.get('caseDir', '').strip()
    
    if not case_dir:
        return jsonify({
            "status": "error",
            "message": "No case directory provided"
        }), 400
    
    # Update config
    config["case_dir"] = case_dir
    save_config()
    
    return jsonify({
        "status": "success",
        "caseDir": case_dir,
        "message": f"Case directory set to: {case_dir}"
    })

@app.route('/set_docker_config', methods=['POST'])
def set_docker_config():
    """Update Docker configuration"""
    data = request.get_json()
    
    # Update config
    config["docker_image"] = data.get("dockerImage", config["docker_image"])
    config["openfoam_version"] = data.get("openfoamVersion", config["openfoam_version"])
    save_config()
    
    return jsonify({
        "status": "success",
        "dockerImage": config["docker_image"],
        "openfoamVersion": config["openfoam_version"],
        "message": "Docker configuration updated"
    })

@app.route('/load_tutorial', methods=['POST'])
def load_tutorial():
    """Load a tutorial case"""
    data = request.get_json()
    tutorial_name = data.get('tutorial')
    
    if not tutorial_name:
        return jsonify({
            "status": "error",
            "message": "No tutorial specified"
        }), 400
    
    # Create a new run directory
    run_dir = create_run_directory()
    
    # Copy the tutorial to the run directory
    tutorial_dir = get_tutorial_case_dir(tutorial_name)
    if not os.path.exists(tutorial_dir):
        return jsonify({
            "status": "error",
            "message": f"Tutorial not found: {tutorial_name}"
        }), 404
    
    # Copy files to the run directory
    try:
        shutil.copytree(tutorial_dir, run_dir, dirs_exist_ok=True)
        
        # Update the current case directory
        config["case_dir"] = run_dir
        save_config()
        
        return jsonify({
            "status": "success",
            "caseDir": run_dir,
            "message": f"Tutorial '{tutorial_name}' loaded successfully"
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to load tutorial: {str(e)}"
        }), 500

@app.route('/run', methods=['POST'])
def run():
    """Run an OpenFOAM command"""
    data = request.get_json()
    command = data.get('command')
    case_dir = data.get('caseDir', config.get('case_dir'))
    
    if not command:
        return jsonify({
            "status": "error",
            "message": "No command specified"
        }), 400
    
    if not case_dir or not os.path.exists(case_dir):
        return jsonify({
            "status": "error",
            "message": f"Case directory does not exist: {case_dir}"
        }), 400
    
    # Return a streaming response
    return Response(
        stream_with_context(run_openfoam_command(case_dir, command)),
        mimetype='text/plain'
    )

if __name__ == '__main__':
    # Ensure required directories exist
    os.makedirs("tutorials", exist_ok=True)
    os.makedirs("runs", exist_ok=True)
    
    # Start the Flask app
    app.run(debug=True, host='0.0.0.0', port=5000)
