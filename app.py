import os
import posixpath
import platform
import pathlib
import json
import docker
import logging
from flask import Flask, request, jsonify, render_template_string, Response

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

# --- Global storage for FoamRun logs ---
foamrun_logs = {}  # { "<tutorial_name>": "<log content>" }
def capture_foamrun_log(command, tutorial, case_dir):
    """Capture log.FoamRun from host if Allrun was executed"""
    if command.startswith("./Allrun"):
                host_log_path = pathlib.Path(case_dir) / tutorial / "log.FoamRun"
                if host_log_path.exists():
                    foamrun_logs[tutorial] = host_log_path.read_text()
                    logger.info(f"[FOAMChalak] Captured log.FoamRun for tutorial '{tutorial}'")
                else:
                    logger.warning(f"[FOAMChalak] log.FoamRun not found at {host_log_path}")

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
            working_dir=container_run_path
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
            try: container.kill()
            except Exception: pass
            try: container.remove()
            except Exception: pass


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

            capture_foamrun_log(command, tutorial, case_dir)

        finally:
            # Always clean up container
            try:
                container.kill()
            except Exception:
                logger.error("[FOAMChalak] Could not kill container")
            try:
                container.remove()
            except Exception:
                logger.error("[FOAMChalak] Could not remove container")

    return Response(stream_container_logs(), mimetype="text/html")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
