import os
import posixpath
import platform
import json
import docker
import logging
from flask import Flask, request, jsonify, render_template_string

app = Flask(__name__)

# --- Logging ---
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("FOAMChalak")

# --- Config file ---
CONFIG_FILE = "case_config.json"

def load_config():
    """Load configuration from case_config.json with sensible defaults."""
    defaults = {
        "CASE_ROOT": os.path.abspath("tutorial_cases"),
        "DOCKER_IMAGE": "haldardhruv/ubuntu_noble_openfoam:v12",
        "OPENFOAM_VERSION": "12"
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                data = json.load(f)
                return {**defaults, **data}
        except Exception as e:
            logger.warning(f"[WARN] Could not load config file: {e}")
    return defaults

def save_config(updates: dict):
    """Save configuration back to case_config.json."""
    config = load_config()
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
    container_case_path = f"/home/foam/OpenFOAM/{OPENFOAM_VERSION}/run"
    docker_cmd = (
        f"bash -c 'source {bashrc} && "
        f"cp -r $FOAM_TUTORIALS/{tutorial} {container_case_path}/'"
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
            volumes={CASE_ROOT: {"bind": container_case_path, "mode": "rw"}},
            working_dir=container_case_path
        )

        result = container.wait()
        logs = container.logs().decode()

        if result["StatusCode"] == 0:
            output = (
                f"INFO::[FOAMChalak] Tutorial loaded::{tutorial}\n"
                f"Source: $FOAM_TUTORIALS/{tutorial}\n"
                f"Copied to: {CASE_ROOT}/{tutorial}\n"
            )
            # Do NOT change CASE_ROOT here
        else:
            output = f"[FOAMChalak] [Error] Failed to load tutorial {tutorial}\n{logs}"

        return jsonify({"output": output, "caseDir": CASE_ROOT})


    finally:
        if container:
            try: container.kill()
            except Exception: pass
            try: container.remove()
            except Exception: pass

@app.route("/run", methods=["POST"])
def run():
    global CASE_ROOT, DOCKER_IMAGE, OPENFOAM_VERSION
    data = request.get_json()
    case_dir = data.get("caseDir") or CASE_ROOT
    command = data.get("command")

    if not case_dir or not os.path.isdir(case_dir):
        return jsonify({"output": "[FOAMChalak] [Error] Invalid case directory"})

    container_case_path = f"/home/foam/OpenFOAM/{OPENFOAM_VERSION}/run"
    bashrc = f"/opt/openfoam{OPENFOAM_VERSION}/etc/bashrc"
    docker_cmd = f"bash -c 'source {bashrc} && cd {container_case_path} && {command}'"

    container = None
    try:
        container = docker_client.containers.run(
            DOCKER_IMAGE,
            docker_cmd,
            detach=True,
            tty=True,
            stdout=True,
            stderr=True,
            volumes={case_dir: {"bind": container_case_path, "mode": "rw"}}
        )

        result = container.wait()
        logs = container.logs().decode()

        if result["StatusCode"] == 0:
            output = f"INFO::[FOAMChalak] Command finished successfully\n$ {command}\n" + logs
        else:
            output = f"[FOAMChalak] [Error] Command failed\n$ {command}\n" + logs

        return jsonify({"output": output})

    except docker.errors.ContainerError as e:
        return jsonify({"output": f"[FOAMChalak] [Error] {e.stderr.decode()}"} )
    except docker.errors.ImageNotFound:
        return jsonify({"output": f"[FOAMChalak] [Error] Docker image not found: {DOCKER_IMAGE}"} )
    except docker.errors.APIError as e:
        return jsonify({"output": f"[FOAMChalak] [Error] Docker API error: {str(e)}"} )
    finally:
        if container:
            try: container.kill()
            except Exception: pass
            try: container.remove()
            except Exception: pass

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
