import os
import subprocess
import logging
import json
import platform
import shutil
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
    """Load OpenFOAM environment from WSL/Linux and detect key paths."""
    env_vars = {}
    system = platform.system()
    try:
        bashrc = os.path.join(openfoam_root, "etc", "bashrc").replace("\\", "/")

        if system == "Linux":
            cmd = ["bash", "-c", f"source {bashrc} && env"]
        elif system == "Windows":
            cmd = ["wsl", "bash", "-c", f"source {bashrc} && env"]
        else:
            raise RuntimeError(f"Unsupported platform: {system}")

        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
        for line in proc.stdout:
            key, _, value = line.decode().partition("=")
            if key and value:
                env_vars[key.strip()] = value.strip()
        proc.communicate()

        # Auto-detect CASE_ROOT and FOAM_TUTORIALS if not already set
        global CASE_ROOT
        if "FOAM_RUN" in env_vars and not CASE_ROOT:
            CASE_ROOT = env_vars["FOAM_RUN"]
        global FOAM_TUTORIALS
        if "FOAM_TUTORIALS" in env_vars:
            FOAM_TUTORIALS = env_vars["FOAM_TUTORIALS"]

    except Exception as e:
        logger.error(f"[ERROR] Could not load OpenFOAM environment: {e}")

    return env_vars


OPENFOAM_ENV = load_openfoam_env(OPENFOAM_ROOT)

FOAM_TUTORIALS = OPENFOAM_ENV.get("FOAM_TUTORIALS", "")
TUTORIAL_LIST = []
if FOAM_TUTORIALS and os.path.isdir(FOAM_TUTORIALS):
    for root, dirs, files in os.walk(FOAM_TUTORIALS):
        if "system" in dirs and "constant" in dirs:
            relpath = os.path.relpath(root, FOAM_TUTORIALS)
            TUTORIAL_LIST.append(relpath)
    TUTORIAL_LIST.sort()

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

    src = os.path.join(FOAM_TUTORIALS, tutorial)
    dest_root = CASE_ROOT
    os.makedirs(dest_root, exist_ok=True)

    dest = os.path.join(dest_root, tutorial.replace("/", "_"))
    if not os.path.exists(dest):
        shutil.copytree(src, dest)

    dest_wsl = to_wsl_path(dest)

    return jsonify({
        "output": f"INFO::[FOAMPilot] Tutorial loaded::{tutorial}\nSource: {src}\nCopied to: {dest_wsl}",
        "caseDir": dest_wsl
    })


@app.route("/run", methods=["POST"])
def run():
    data = request.get_json()
    case_dir = data.get("caseDir") or CASE_ROOT
    command = data.get("command")

    if not case_dir or not os.path.isdir(case_dir):
        return jsonify({"output": "[FOAMPilot] [Error] Invalid case directory"})

    case_dir_wsl = to_wsl_path(case_dir)

    try:
        prep_msg = f"INFO::[FOAMPilot] Changing directory to: {case_dir_wsl}\n$ {command}\n"

        if platform.system() == "Windows":
            full_cmd = f"wsl bash -c 'cd {case_dir_wsl} && {command}'"
        else:
            full_cmd = command

        proc = subprocess.run(
            full_cmd,
            cwd=case_dir if platform.system() == "Linux" else None,
            shell=True,
            capture_output=True,
            text=True,
            env={**os.environ, **OPENFOAM_ENV}
        )
        output = prep_msg + proc.stdout + proc.stderr
        return jsonify({"output": output})
    except Exception as e:
        return jsonify({"output": f"[FOAMPilot] [Error] {str(e)}"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
