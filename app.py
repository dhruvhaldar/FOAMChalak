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
logger = logging.getLogger("FOAMChalak")

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

def save_config(config):
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
    return os.path.join(
        os.path.abspath("tutorials"),
        tutorial_name
    )

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

# --- API Endpoints ---

@app.route('/')
def index():
    """Render the main page"""
    # Get available tutorials
    tutorials_dir = os.path.join(os.path.dirname(__file__), "tutorials")
    tutorials = [d for d in os.listdir(tutorials_dir) 
                if os.path.isdir(os.path.join(tutorials_dir, d))]
    
    # Create HTML options for the dropdown
    options = "".join(
        f'<option value="{t}">{t}</option>' 
        for t in sorted(tutorials)
    )
    
    return render_template_string(
        open("static/foamchalak_frontend.html").read(),
        options=options
    )

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
    save_config(config)
    
    return jsonify({
        "status": "success",
        "caseDir": case_dir,
        "output": f"Case directory set to: {case_dir}"
    })

@app.route('/set_docker_config', methods=['POST'])
def set_docker_config():
    """Update Docker configuration"""
    data = request.get_json()
    
    # Update config
    config["docker_image"] = data.get("dockerImage", config["docker_image"])
    config["openfoam_version"] = data.get("openfoamVersion", config["openfoam_version"])
    save_config(config)
    
    return jsonify({
        "status": "success",
        "dockerImage": config["docker_image"],
        "openfoamVersion": config["openfoam_version"]
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
        output = f"Tutorial loaded: {tutorial_name}\n"
        output += f"Source: {tutorial_dir}\n"
        output += f"Copied to: {run_dir}"
        
        # Update the current case directory
        config["case_dir"] = run_dir
        save_config(config)
        
        return jsonify({
            "status": "success",
            "output": output
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
    app.run(debug=True, host='0.0.0.0', port=5000)
    config.update(updates)
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        logger.error(f"[ERROR] Could not save config: {e}")

# --- Load config ---
CONFIG = load_config()
CASE_ROOT = CONFIG["CASE_ROOT"]
DOCKER_IMAGE = CONFIG["DOCKER_IMAGE"]
OPENFOAM_VERSION = CONFIG["OPENFOAM_VERSION"]

# --- Docker client ---
docker_client = docker.from_env()

# --- Load HTML template ---
TEMPLATE_FILE = os.path.join("static", "foamchalak_frontend.html")
with open(TEMPLATE_FILE, "r") as f:
    TEMPLATE = f.read()

# --- Helpers ---
def get_tutorials():
    """Return a list of available OpenFOAM tutorial cases (category/case)."""
    try:
        bashrc = f"/opt/openfoam{OPENFOAM_VERSION}/etc/bashrc"
        docker_cmd = f"bash -c 'source {bashrc} && echo $FOAM_TUTORIALS'"

        container = docker_client.containers.run(
            DOCKER_IMAGE, docker_cmd, remove=True,
            stdout=True, stderr=True, tty=True
        )
        tutorial_root = container.decode().strip()
        if not tutorial_root:
            return []

        # Find actual tutorial cases
        docker_cmd = (
            "bash -c 'find " + tutorial_root +
            " -mindepth 2 -maxdepth 2 -type d "
            "-exec test -d {}/system -a -d {}/constant \\; -print'"
        )
        container = docker_client.containers.run(
            DOCKER_IMAGE, docker_cmd, remove=True,
            stdout=True, stderr=True, tty=True
        )
        cases = container.decode().splitlines()

        # Normalize only if running on Windows
        if platform.system() == "Windows":
            tutorials = [posixpath.relpath(c, tutorial_root) for c in cases]
        else:
            tutorials = [os.path.relpath(c, tutorial_root) for c in cases]

        tutorials.sort()
        return tutorials

    except Exception as e:
        logger.error(f"[FOAMPilot] Could not fetch tutorials: {e}")
        return []

# --- Global storage for FoamRun logs ---
foamrun_logs = {}  # { "<tutorial_name>": "<log content>" }

def monitor_foamrun_log(tutorial, case_dir):
    """Watch for log.FoamRun, capture it in foamrun_logs and write it to a file."""
    import pathlib
    import time

    host_log_path = pathlib.Path(case_dir) / tutorial / "log.FoamRun"
    output_file = pathlib.Path(case_dir) / tutorial / "foamrun_logs.txt"

    timeout = 300  # seconds max wait
    interval = 1   # check every 1 second
    elapsed = 0

    while elapsed < timeout:
        if host_log_path.exists():
            log_content = host_log_path.read_text()
            foamrun_logs[tutorial] = log_content

            # Write to file
            try:
                output_file.write_text(log_content)
                logger.info(f"[FOAMChalak] Captured log.FoamRun for tutorial '{tutorial}' and wrote to {output_file}")
            except Exception as e:
                logger.error(f"[FOAMChalak] Could not write foamrun_logs to file: {e}")

            return

        time.sleep(interval)
        elapsed += interval

    logger.warning(f"[FOAMChalak] Timeout: log.FoamRun not found for '{tutorial}'")

# --- Routes ---
@app.route("/")
def index():
    tutorials = get_tutorials()
    options_html = "\n".join([f"<option value='{t}'>{t}</option>" for t in tutorials])
    return render_template_string(TEMPLATE, options=options_html, CASE_ROOT=CASE_ROOT)

@app.route("/get_case_root", methods=["GET"])
def get_case_root():
    return jsonify({"caseDir": CASE_ROOT})

@app.route("/set_case", methods=["POST"])
def set_case():
    global CASE_ROOT
    data = request.get_json()
    case_dir = data.get("caseDir")
    if not case_dir:
        return jsonify({"output": "[FOAMChalak] [Error] No caseDir provided"})
    case_dir = os.path.abspath(case_dir)
    os.makedirs(case_dir, exist_ok=True)
    CASE_ROOT = case_dir
    save_config({"CASE_ROOT": CASE_ROOT})
    return jsonify({
        "output": f"INFO::[FOAMChalak] Case root set to: {CASE_ROOT}",
        "caseDir": CASE_ROOT
    })

@app.route("/get_docker_config", methods=["GET"])
def get_docker_config():
    return jsonify({
        "dockerImage": DOCKER_IMAGE,
        "openfoamVersion": OPENFOAM_VERSION
    })

@app.route("/set_docker_config", methods=["POST"])
def set_docker_config():
    global DOCKER_IMAGE, OPENFOAM_VERSION
    data = request.get_json()
    if "dockerImage" in data:
        DOCKER_IMAGE = data["dockerImage"]
    if "openfoamVersion" in data:
        OPENFOAM_VERSION = str(data["openfoamVersion"])
    save_config({
        "DOCKER_IMAGE": DOCKER_IMAGE,
        "OPENFOAM_VERSION": OPENFOAM_VERSION
    })
    return jsonify({
        "output": f"INFO::[FOAMChalak] Docker config updated",
        "dockerImage": DOCKER_IMAGE,
        "openfoamVersion": OPENFOAM_VERSION
    })

@app.route("/load_tutorial", methods=["POST"])
def load_tutorial():
    global CASE_ROOT, DOCKER_IMAGE, OPENFOAM_VERSION
    data = request.get_json()
    tutorial = data.get("tutorial")

    if not tutorial:
        return jsonify({"output": "[FOAMChalak] [Error] No tutorial selected"})

    bashrc = f"/opt/openfoam{OPENFOAM_VERSION}/etc/bashrc"
    container_run_path = f"/home/foam/OpenFOAM/{OPENFOAM_VERSION}/run"
    container_case_path = posixpath.join(container_run_path, tutorial)

    docker_cmd = (
    f"bash -c 'source {bashrc} && "
    f"mkdir -p {container_case_path} && "
    f"cp -r $FOAM_TUTORIALS/{tutorial}/* {container_case_path} && "
    f"chmod +x {container_case_path}/Allrun'"
    )

    container = None
    try:
        container = docker_client.containers.run(
            DOCKER_IMAGE,
            docker_cmd,
            detach=True,
            tty=True,
            stdout=True,
            stderr=True,
            volumes={CASE_ROOT: {"bind": container_run_path, "mode": "rw"}},
            working_dir=container_run_path,
            remove=True
        )

        result = container.wait()
        logs = container.logs().decode()

        if result["StatusCode"] == 0:
            output = (
                f"INFO::[FOAMChalak] Tutorial loaded::{tutorial}\n"
                f"Source: $FOAM_TUTORIALS/{tutorial}\n"
                f"Copied to: {CASE_ROOT}/{tutorial}\n"
            )
        else:
            output = f"[FOAMChalak] [Error] Failed to load tutorial {tutorial}\n{logs}"

        return jsonify({"output": output, "caseDir": CASE_ROOT})

    finally:
        if container:
            try:
                container.reload()
                if container.status == "running":
                    container.kill()
            except Exception:
                pass
            try:
                container.remove()
            except Exception:
                pass


@app.route("/run", methods=["POST"])
def run_case():
    data = request.json
    tutorial = data.get("tutorial")
    command = data.get("command")
    case_dir = data.get("caseDir")

    if not command:
        return {"error": "No command provided"}, 400
    if not tutorial or not case_dir:
        return {"error": "Missing tutorial or caseDir"}, 400

    def stream_container_logs():
        container_case_path = posixpath.join(
            f"/home/foam/OpenFOAM/{OPENFOAM_VERSION}/run", tutorial
        )
        bashrc = f"/opt/openfoam{OPENFOAM_VERSION}/etc/bashrc"

        # Convert Windows path to POSIX for Docker volumes
        host_path = pathlib.Path(case_dir).resolve().as_posix()
        volumes = {
            host_path: {"bind": f"/home/foam/OpenFOAM/{OPENFOAM_VERSION}/run", "mode": "rw"}
        }

        # Start the watcher thread before running container
        watcher_thread = threading.Thread(
            target=monitor_foamrun_log,
            args=(tutorial, case_dir),
            daemon=True
        )
        watcher_thread.start()

        docker_cmd = f"bash -c 'source {bashrc} && cd {container_case_path} && chmod +x {command} && ./{command}'"

        container = docker_client.containers.run(
            DOCKER_IMAGE,
            docker_cmd,
            detach=True,
            tty=False,
            volumes=volumes,
            working_dir=container_case_path
        )

        try:
            # Stream logs line by line
            for line in container.logs(stream=True):
                decoded = line.decode(errors="ignore")
                for subline in decoded.splitlines():
                    yield subline + "<br>"

        finally:
            try:
                container.kill()
            except:
                pass
            try:
                container.remove()
            except:
                logger.error("[FOAMPilot] Could not remove container")

    return Response(stream_container_logs(), mimetype="text/html")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
