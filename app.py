import os
import subprocess
import logging
import json
import platform
import sys
from flask import Flask, request, jsonify, render_template_string

# Docker imports (only used on Windows)
try:
    import docker
    DOCKER_AVAILABLE = True
except ImportError:
    DOCKER_AVAILABLE = False
    docker = None

app = Flask(__name__)

# --- Logging ---
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# --- Config file for persistence ---
CONFIG_FILE = "case_config.json"

# --- Platform detection ---
IS_WINDOWS = platform.system() == "Windows"

def load_config():
    """Load CASE_ROOT and OPENFOAM_ROOT from JSON config."""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                data = json.load(f)
                case_root = data.get("CASE_ROOT", os.path.abspath("run_folder"))
                openfoam_root = data.get("OPENFOAM_ROOT", "/usr/lib/openfoam/openfoam2506")
                return case_root, openfoam_root
        except Exception as e:
            logger.warning(f"[WARN] Could not load config file: {e}")
    return os.path.abspath("run_folder"), "/usr/lib/openfoam/openfoam2506"

def save_config(case_root=None, openfoam_root=None):
    """Save CASE_ROOT and OPENFOAM_ROOT to JSON config."""
    data = {}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                data = json.load(f)
        except Exception as e:
            logger.warning(f"[WARN] Could not read config file for saving: {e}")
    if case_root is not None:
        data["CASE_ROOT"] = case_root
    if openfoam_root is not None:
        data["OPENFOAM_ROOT"] = openfoam_root
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(data, f)
    except Exception as e:
        logger.error(f"[ERROR] Could not save config file: {e}")

def run_openfoam_docker(command, case_dir, image="haldardhruv/ubuntu_noble_openfoam:v12", openfoam_version="12"):
    """
    Run OpenFOAM command inside a Docker container (Windows only).
    
    Parameters
    ----------
    command : str
        OpenFOAM command to run
    case_dir : str
        Path to the case directory on the host system
    image : str
        Docker image name containing OpenFOAM
    openfoam_version : str
        OpenFOAM version string
    
    Returns
    -------
    str
        Combined stdout and stderr output
    """
    if not DOCKER_AVAILABLE:
        return "[FOAMPilot] [Error] Docker package not available. Install with: pip install docker"
    
    try:
        client = docker.from_env()
        container_case_path = f"/home/foam/OpenFOAM/{openfoam_version}/run"
        
        # Convert Windows paths to Unix-style for Docker
        case_dir_unix = case_dir.replace("\\", "/")
        
        docker_command = (
            "bash -c "
            f"'source /opt/openfoam{openfoam_version}/etc/bashrc "
            f"&& cd {container_case_path} "
            f"&& {command}'"
        )
        
        container = None
        try:
            # Create and start container
            container = client.containers.run(
                image,
                docker_command,
                detach=True,
                tty=True,
                stdout=True,
                stderr=True,
                volumes={case_dir: {"bind": container_case_path, "mode": "rw"}},
                remove=False  # We'll remove manually for better error handling
            )
            
            # Wait for completion and capture logs
            result = container.wait()
            logs = container.logs().decode()
            
            prep_msg = f"INFO::[FOAMPilot] [Docker] Running in container\nCase directory: {case_dir}\n$ {command}\n"
            
            if result["StatusCode"] == 0:
                return prep_msg + logs
            else:
                return prep_msg + f"[ERROR] Command failed with exit code {result['StatusCode']}\n" + logs
                
        except docker.errors.ImageNotFound:
            return f"[FOAMPilot] [Error] Docker image not found: {image}\nPlease pull the image with: docker pull {image}"
        except docker.errors.APIError as e:
            return f"[FOAMPilot] [Error] Docker API error: {str(e)}"
        finally:
            if container:
                try:
                    container.kill()     # kill if still running
                except Exception:
                    pass
                try:
                    container.remove()   # always remove
                except Exception:
                    pass
                    
    except Exception as e:
        return f"[FOAMPilot] [Error] Docker execution failed: {str(e)}"

def get_docker_tutorials(image="haldardhruv/ubuntu_noble_openfoam:v12", openfoam_version="12"):
    """
    Get list of OpenFOAM tutorials from Docker container.
    
    Parameters
    ----------
    image : str
        Docker image name containing OpenFOAM
    openfoam_version : str
        OpenFOAM version string
    
    Returns
    -------
    list
        List of tutorial paths
    """
    if not DOCKER_AVAILABLE:
        logger.warning("[WARN] Docker not available, using fallback tutorial list")
        return [
            "incompressible/simpleFoam/pitzDaily",
            "incompressible/simpleFoam/airFoil2D",
            "incompressible/pisoFoam/cavity",
            "basic/laplacianFoam/flange",
            "basic/potentialFoam/cylinder"
        ]
    
    try:
        client = docker.from_env()
        
        # Command to find all tutorial directories (those containing both 'system' and 'constant' dirs)
        docker_command = (
            "bash -c "
            f"'source /opt/openfoam{openfoam_version}/etc/bashrc "
            "&& find $FOAM_TUTORIALS -type d -name system -exec dirname {} \\; | "
            "while read dir; do "
            "  if [ -d \"$dir/constant\" ] && [ -d \"$dir/system\" ]; then "
            "    echo \"${dir#$FOAM_TUTORIALS/}\"; "
            "  fi; "
            "done | sort'"
        )
        
        container = None
        try:
            # Create and start container
            container = client.containers.run(
                image,
                docker_command,
                detach=True,
                tty=True,
                stdout=True,
                stderr=True,
                remove=False
            )
            
            # Wait for completion and capture logs
            result = container.wait()
            logs = container.logs().decode().strip()
            
            if result["StatusCode"] == 0 and logs:
                tutorials = [line.strip() for line in logs.split('\n') if line.strip()]
                logger.info(f"[INDEX] Found {len(tutorials)} tutorials from Docker container")
                return tutorials
            else:
                logger.warning("[WARN] Failed to get tutorials from Docker, using fallback")
                return [
                    "incompressible/simpleFoam/pitzDaily",
                    "incompressible/simpleFoam/airFoil2D", 
                    "incompressible/pisoFoam/cavity",
                    "basic/laplacianFoam/flange",
                    "basic/potentialFoam/cylinder"
                ]
                
        except docker.errors.ImageNotFound:
            logger.error(f"[ERROR] Docker image not found: {image}")
            return []
        except docker.errors.APIError as e:
            logger.error(f"[ERROR] Docker API error: {str(e)}")
            return []
        finally:
            if container:
                try:
                    container.kill()
                except Exception:
                    pass
                try:
                    container.remove()
                except Exception:
                    pass
                    
    except Exception as e:
        logger.error(f"[ERROR] Failed to get tutorials from Docker: {str(e)}")
        return []

# --- Load CASE_ROOT and OPENFOAM_ROOT ---
CASE_ROOT, OPENFOAM_ROOT = load_config()
logger.info(f"[INDEX] Loaded CASE_ROOT: {CASE_ROOT}")
logger.info(f"[INDEX] Loaded OPENFOAM_ROOT: {OPENFOAM_ROOT}")
logger.info(f"[INDEX] Platform: {platform.system()}")
logger.info(f"[INDEX] Docker available: {DOCKER_AVAILABLE}")

# Initialize OpenFOAM environment and tutorials (non-Windows only)
OPENFOAM_ENV = {}
TUTORIAL_LIST = []

if not IS_WINDOWS:
    # --- Load OpenFOAM environment once ---
    BASHRC = os.path.join(OPENFOAM_ROOT, "etc/bashrc")
    if os.path.exists(BASHRC):
        command = f"bash -c 'source {BASHRC} && env'"
        try:
            proc = subprocess.Popen(command, stdout=subprocess.PIPE, shell=True, executable="/bin/bash")
            for line in proc.stdout:
                key, _, value = line.decode().partition("=")
                OPENFOAM_ENV[key.strip()] = value.strip()
            proc.communicate()
        except Exception as e:
            logger.warning(f"[WARN] Could not load OpenFOAM environment: {e}")

    # Tutorials list
    FOAM_TUTORIALS = OPENFOAM_ENV.get("FOAM_TUTORIALS", "")
    if FOAM_TUTORIALS and os.path.isdir(FOAM_TUTORIALS):
        for root, dirs, files in os.walk(FOAM_TUTORIALS):
            if "system" in dirs and "constant" in dirs:
                relpath = os.path.relpath(root, FOAM_TUTORIALS)
                TUTORIAL_LIST.append(relpath)
        TUTORIAL_LIST.sort()
else:
    # On Windows, get tutorials from Docker container
    logger.info("[INDEX] Running on Windows - fetching tutorials from Docker container")
    TUTORIAL_LIST = get_docker_tutorials()
    if TUTORIAL_LIST:
        logger.info(f"[INDEX] Successfully loaded {len(TUTORIAL_LIST)} tutorials from Docker")
    else:
        logger.warning("[INDEX] Failed to load tutorials from Docker, using empty list")

# --- Load HTML template ---
TEMPLATE_FILE = os.path.join("static", "foampilot_frontend.html")
try:
    with open(TEMPLATE_FILE, "r") as f:
        TEMPLATE = f.read()
except FileNotFoundError:
    # Fallback basic template if file not found
    TEMPLATE = """
    <html>
    <head><title>FOAMPilot</title></head>
    <body>
    <h1>FOAMPilot</h1>
    <p>Case Root: {{CASE_ROOT}}</p>
    <p>Platform: """ + platform.system() + """</p>
    <select>{{options|safe}}</select>
    </body>
    </html>
    """

# --- Routes ---

@app.route("/")
def index():
    options = "".join([f'<option value="{t}">{t}</option>' for t in TUTORIAL_LIST])
    return render_template_string(TEMPLATE, options=options, CASE_ROOT=CASE_ROOT)

# --- CASE_ROOT Endpoints ---
@app.route("/get_case_root", methods=["GET"])
def get_case_root():
    return jsonify({"caseDir": CASE_ROOT})

@app.route("/set_case", methods=["POST"])
def set_case():
    global CASE_ROOT
    data = request.get_json()
    case_dir = data.get("caseDir")
    if not case_dir:
        return jsonify({"output": "[FOAMPilot] [Error] No caseDir provided"})
    case_dir = os.path.abspath(case_dir)
    os.makedirs(case_dir, exist_ok=True)
    CASE_ROOT = case_dir
    save_config(case_root=CASE_ROOT)
    logger.debug(f"[DEBUG] [set_case] CASE_ROOT set to: {CASE_ROOT}")
    return jsonify({
        "output": f"INFO::[FOAMPilot] Case root set to: {CASE_ROOT}",
        "caseDir": CASE_ROOT
    })

# --- OPENFOAM_ROOT Endpoints ---
@app.route("/get_openfoam_root", methods=["GET"])
def get_openfoam_root():
    return jsonify({"openfoamRoot": OPENFOAM_ROOT})

@app.route("/set_openfoam_root", methods=["POST"])
def set_openfoam_root():
    global OPENFOAM_ROOT
    data = request.get_json()
    root = data.get("openfoamRoot")
    
    if IS_WINDOWS:
        # On Windows, we don't need a local OpenFOAM installation
        OPENFOAM_ROOT = root or "Docker-based"
        save_config(openfoam_root=OPENFOAM_ROOT)
        return jsonify({
            "output": f"INFO::[FOAMPilot] Running on Windows - using Docker for OpenFOAM",
            "openfoamRoot": OPENFOAM_ROOT
        })
    
    if not root or not os.path.isdir(root):
        return jsonify({"output": "[FOAMPilot] [Error] Invalid OpenFOAM root", "openfoamRoot": OPENFOAM_ROOT})
    OPENFOAM_ROOT = os.path.abspath(root)
    save_config(openfoam_root=OPENFOAM_ROOT)
    logger.debug(f"[DEBUG] [set_openfoam_root] OPENFOAM_ROOT set to: {OPENFOAM_ROOT}")
    return jsonify({"output": f"INFO::[FOAMPilot] OPENFOAM_ROOT set to: {OPENFOAM_ROOT}", "openfoamRoot": OPENFOAM_ROOT})

# --- Load tutorial ---
@app.route("/load_tutorial", methods=["POST"])
def load_tutorial():
    global CASE_ROOT
    data = request.get_json()
    tutorial = data.get("tutorial")
    if not tutorial:
        return jsonify({"output": "[FOAMPilot] [Error] No tutorial selected", "caseDir": ""})

    dest_root = CASE_ROOT
    os.makedirs(dest_root, exist_ok=True)
    dest = os.path.join(dest_root, tutorial.replace("/", "_"))

    if IS_WINDOWS:
        # On Windows with Docker, we need to copy from the container
        if not os.path.exists(dest):
            if DOCKER_AVAILABLE:
                try:
                    client = docker.from_env()
                    # Create a temporary container to copy tutorial files
                    container = client.containers.run(
                        "haldardhruv/ubuntu_noble_openfoam:v12",
                        "bash -c 'sleep 10'",  # Keep container alive briefly
                        detach=True,
                        tty=True
                    )
                    
                    # Copy tutorial from container
                    tutorial_path = f"/opt/openfoam12/tutorials/{tutorial}"
                    
                    # Use docker cp command via subprocess (more reliable than docker-py for copying)
                    subprocess.run([
                        "docker", "cp", 
                        f"{container.id}:{tutorial_path}", 
                        dest
                    ], check=True)
                    
                    container.kill()
                    container.remove()
                    
                except Exception as e:
                    return jsonify({
                        "output": f"[FOAMPilot] [Error] Failed to copy tutorial from Docker: {str(e)}",
                        "caseDir": ""
                    })
            else:
                return jsonify({
                    "output": "[FOAMPilot] [Error] Docker not available for tutorial loading on Windows",
                    "caseDir": ""
                })
    else:
        # Original non-Windows behavior
        FOAM_TUTORIALS = OPENFOAM_ENV.get("FOAM_TUTORIALS", "")
        if not FOAM_TUTORIALS:
            return jsonify({"output": "[FOAMPilot] [Error] FOAM_TUTORIALS not found", "caseDir": ""})
            
        src = os.path.join(FOAM_TUTORIALS, tutorial)
        if not os.path.exists(dest):
            subprocess.run(["cp", "-r", src, dest])

    return jsonify({
        "output": f"INFO::[FOAMPilot] Tutorial loaded::{tutorial}\nCopied to: {dest}",
        "caseDir": dest
    })

# --- Run commands ---
@app.route("/run", methods=["POST"])
def run():
    data = request.get_json()
    case_dir = data.get("caseDir") or CASE_ROOT
    command = data.get("command")

    if not case_dir or not os.path.isdir(case_dir):
        return jsonify({"output": "[FOAMPilot] [Error] Invalid case directory"})

    try:
        if IS_WINDOWS:
            # Use Docker on Windows
            output = run_openfoam_docker(command, case_dir)
        else:
            # Original behavior for non-Windows platforms
            prep_msg = f"INFO::[FOAMPilot] Changing directory to: {case_dir}\n$ {command}\n"
            proc = subprocess.run(
                command,
                cwd=case_dir,
                shell=True,
                capture_output=True,
                text=True,
                env={**os.environ, **OPENFOAM_ENV}
            )
            output = prep_msg + proc.stdout + proc.stderr
            
        return jsonify({"output": output})
    except Exception as e:
        return jsonify({"output": f"[FOAMPilot] [Error] {str(e)}"})

# --- Docker status endpoint (useful for Windows users) ---
@app.route("/docker_status", methods=["GET"])
def docker_status():
    """Check Docker availability and OpenFOAM image status."""
    if not IS_WINDOWS:
        return jsonify({"status": "Docker check not needed on this platform"})
    
    if not DOCKER_AVAILABLE:
        return jsonify({"status": "Docker package not installed", "available": False})
    
    try:
        client = docker.from_env()
        client.ping()
        
        # Check if OpenFOAM image exists
        try:
            image = client.images.get("haldardhruv/ubuntu_noble_openfoam:v12")
            return jsonify({
                "status": "Docker is running and OpenFOAM image is available",
                "available": True,
                "image_id": image.id[:12]
            })
        except docker.errors.ImageNotFound:
            return jsonify({
                "status": "Docker is running but OpenFOAM image not found",
                "available": True,
                "suggestion": "Run: docker pull haldardhruv/ubuntu_noble_openfoam:v12"
            })
    except Exception as e:
        return jsonify({
            "status": f"Docker not available: {str(e)}",
            "available": False
        })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)