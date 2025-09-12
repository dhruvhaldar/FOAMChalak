import os
import subprocess
import logging
import json
import platform
import shutil
import docker
import sys
from flask import Flask, request, jsonify, render_template_string

app = Flask(__name__)

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

CONFIG_FILE = "case_config.json"


def load_config():
    """
    Load CASE_ROOT and OPENFOAM_ROOT from JSON config.
    If OPENFOAM_ROOT is not set, auto-detect the latest OpenFOAM installation in /usr/lib.
    CASE_ROOT defaults to OPENFOAM_ROOT if not set.
    """
    case_root_default = None
    openfoam_root_default = None

    # Try to read from config file
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                data = json.load(f)
                case_root = data.get("CASE_ROOT")
                openfoam_root = data.get("OPENFOAM_ROOT")
                if case_root and openfoam_root:
                    return case_root, openfoam_root
        except Exception as e:
            logger.warning(f"[WARN] Could not load config file: {e}")

    # Auto-detect OpenFOAM installations in /usr/lib
    openfoam_base = "/usr/lib"
    if os.path.isdir(openfoam_base):
        versions = [d for d in os.listdir(openfoam_base) if d.startswith("openfoam")]
        if versions:
            # Pick the latest version
            versions.sort(reverse=True)
            openfoam_root_default = os.path.join(openfoam_base, versions[0])
            case_root_default = openfoam_root_default  # Use the same as default case directory
        else:
            logger.warning(f"[WARN] No OpenFOAM installation found in {openfoam_base}")
    else:
        logger.warning(f"[WARN] OpenFOAM base directory {openfoam_base} does not exist")

    # Fallback defaults
    openfoam_root = openfoam_root_default or "/usr/lib/openfoam2506"
    case_root = case_root_default or openfoam_root

    return case_root, openfoam_root


def save_config(case_root=None, openfoam_root=None):
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


CASE_ROOT, OPENFOAM_ROOT = load_config()
logger.info(f"[INDEX] Loaded CASE_ROOT: {CASE_ROOT}")
logger.info(f"[INDEX] Loaded OPENFOAM_ROOT: {OPENFOAM_ROOT}")


def to_wsl_path(path: str) -> str:
    """Convert Windows path to WSL /mnt path if needed."""
    if platform.system() == "Windows":
        if ":" in path:
            drive, rest = path.split(":", 1)
            drive_letter = drive.lower()
            rest = rest.strip("\\/").replace("\\", "/")
            return f"/mnt/{drive_letter}/{rest}"
    return path


def load_openfoam_env(openfoam_root: str):
    """Load OpenFOAM environment using Docker.
    
    Returns a minimal set of environment variables and fetches tutorials
    from the Docker container.
    """
    env_vars = {
        "FOAM_RUN": "/mnt/case",  # Will be mounted from host
        "FOAM_TUTORIALS": "/opt/openfoam12/tutorials"  # Default in the container
    }
    
    # Try to get tutorials from the container
    try:
        client = docker.from_env()
        container = None
        try:
            # Run a command to list tutorials - using sh -c to properly handle the command
            result = client.containers.run(
                "haldardhruv/ubuntu_noble_openfoam:v12",
                ["sh", "-c", "find /opt/openfoam12/tutorials -name system -type d | xargs -I {} dirname {}"],
                remove=True,
                stdout=True,
                stderr=True
            )
            tutorials = result.decode().split('\n')
            tutorials = [t.replace('/opt/openfoam12/tutorials/', '') 
                        for t in tutorials if t.strip()]
            env_vars["_TUTORIALS"] = sorted(tutorials)  # Sort the tutorials
        except Exception as e:
            logger.warning(f"Could not fetch tutorials from container: {e}")
            # Provide some default tutorials in case of error
            env_vars["_TUTORIALS"] = [
                "incompressible/simpleFoam/airFoil2D",
                "incompressible/simpleFoam/motorBike",
                "incompressible/pimpleFoam/les/pitzDaily"
            ]
    except Exception as e:
        logger.warning(f"Docker not available for tutorial loading: {e}")
        env_vars["_TUTORIALS"] = []
    
    return env_vars


def run_openfoam_docker(
    solver: str = "simpleFoam",
    case_dir: str = None,
    image: str = "haldardhruv/ubuntu_noble_openfoam:v12",
    openfoam_version: str = "12"
):
    """
    Run an OpenFOAM solver inside a Docker container.
    
    Parameters
    ----------
    solver : str
        OpenFOAM solver to run (e.g., simpleFoam, pisoFoam).
    case_dir : str
        Path to the case directory on the host system.
    image : str
        Docker image name containing OpenFOAM.
    openfoam_version : str
        OpenFOAM version string (default: "12").
    
    Returns
    -------
    tuple
        (success: bool, output: str)
    """
    try:
        client = docker.from_env()
        case_dir = os.path.abspath(case_dir or CASE_ROOT)
        container_case_path = f"/home/foam/OpenFOAM/{openfoam_version}/run"

        command = (
            "bash -c "
            f"'source /opt/openfoam{openfoam_version}/etc/bashrc "
            f"&& cd {container_case_path} "
            f"&& {solver}'"
        )

        container = None
        try:
            # Create and start container
            container = client.containers.run(
                image,
                command,
                detach=True,
                tty=True,
                stdout=True,
                stderr=True,
                volumes={
                    case_dir: {
                        "bind": container_case_path,
                        "mode": "rw"
                    }
                },
                working_dir=container_case_path
            )

            # Wait for completion and capture logs
            result = container.wait()
            logs = container.logs().decode()

            if result["StatusCode"] == 0:
                return True, f"✅ Solver finished successfully\n{logs}"
            else:
                return False, f"❌ Solver failed\n{logs}"

        except docker.errors.ImageNotFound:
            return False, f"❌ Docker image not found: {image}"
        except docker.errors.APIError as e:
            return False, f"❌ Docker API error: {str(e)}"
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
        return False, f"❌ Error running Docker: {str(e)}"


OPENFOAM_ENV = load_openfoam_env(OPENFOAM_ROOT)

# Get tutorials from environment or use empty list
TUTORIAL_LIST = OPENFOAM_ENV.get("_TUTORIALS", [])
TEMPLATE_FILE = os.path.join("static", "foampilot_frontend.html")
with open(TEMPLATE_FILE, "r") as f:
    TEMPLATE = f.read()


@app.route("/")
def index():
    options = "".join([f'<option value="{t}">{t}</option>' for t in TUTORIAL_LIST])
    return render_template_string(TEMPLATE, options=options, CASE_ROOT=CASE_ROOT)


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

    # Convert for WSL
    CASE_ROOT = to_wsl_path(case_dir)

    save_config(case_root=CASE_ROOT)
    logger.debug(f"[DEBUG] [set_case] CASE_ROOT set to: {CASE_ROOT}")
    return jsonify({
        "output": f"INFO::[FOAMPilot] Case root set to: {CASE_ROOT}",
        "caseDir": CASE_ROOT
    })


@app.route("/get_openfoam_root", methods=["GET"])
def get_openfoam_root():
    return jsonify({"openfoamRoot": OPENFOAM_ROOT})


@app.route("/set_openfoam_root", methods=["POST"])
def set_openfoam_root():
    global OPENFOAM_ROOT, OPENFOAM_ENV
    data = request.get_json()
    root = data.get("openfoamRoot")
    if not root or not os.path.isdir(root):
        return jsonify({"output": "[FOAMPilot] [Error] Invalid OpenFOAM root", "openfoamRoot": OPENFOAM_ROOT})
    OPENFOAM_ROOT = os.path.abspath(root)
    save_config(openfoam_root=OPENFOAM_ROOT)
    OPENFOAM_ENV = load_openfoam_env(OPENFOAM_ROOT)
    logger.debug(f"[DEBUG] [set_openfoam_root] OPENFOAM_ROOT set to: {OPENFOAM_ROOT}")
    return jsonify({"output": f"INFO::[FOAMPilot] OPENFOAM_ROOT set to: {OPENFOAM_ROOT}", "openfoamRoot": OPENFOAM_ROOT})


@app.route("/load_tutorial", methods=["POST"])
def load_tutorial():
    global CASE_ROOT
    data = request.get_json()
    tutorial = data.get("tutorial")
    if not tutorial:
        return jsonify({"output": "[FOAMPilot] [Error] No tutorial selected", "caseDir": ""})

    try:
        # Create a temporary directory for the tutorial
        tutorial_name = os.path.basename(tutorial)
        dest_dir = os.path.join(CASE_ROOT, tutorial_name)
        
        # Use Docker to copy the tutorial
        client = docker.from_env()
        container = None
        try:
            # Create a container with the tutorial directory mounted
            container = client.containers.run(
                "haldardhruv/ubuntu_noble_openfoam:v12",
                f"cp -r /opt/openfoam12/tutorials/{tutorial} /mnt/case/",
                volumes={
                    os.path.abspath(CASE_ROOT): {
                        "bind": "/mnt/case",
                        "mode": "rw"
                    }
                },
                remove=True,
                stdout=True,
                stderr=True
            )
            
            return jsonify({
                "output": f"INFO::[FOAMPilot] Tutorial loaded: {tutorial}\nCopied to: {dest_dir}",
                "caseDir": dest_dir
            })
            
        except Exception as e:
            return jsonify({"output": f"[FOAMPilot] [Error] Failed to load tutorial: {str(e)}"})
            
    except Exception as e:
        return jsonify({"output": f"[FOAMPilot] [Error] {str(e)}"})


@app.route("/run", methods=["POST"])
def run():
    data = request.get_json()
    command = data.get("command", "").strip()
    
    if not command:
        return jsonify({"output": "[FOAMPilot] [Error] No command provided"})
    
    # Check if it's an OpenFOAM solver command
    if command.endswith("Foam"):
        success, output = run_openfoam_docker(
            solver=command,
            case_dir=CASE_ROOT
        )
        return jsonify({"output": output})
    
    # Fallback to subprocess for non-OpenFOAM commands
    try:
        proc = subprocess.Popen(
            command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=CASE_ROOT
        )
        stdout, stderr = proc.communicate()
        output = stdout.decode() + "\n" + stderr.decode()
        return jsonify({"output": output})
    except Exception as e:
        return jsonify({"output": f"[FOAMPilot] [Error] {str(e)}"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
