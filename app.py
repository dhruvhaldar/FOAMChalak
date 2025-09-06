import os
import subprocess
import logging
import json
from flask import Flask, request, jsonify, render_template_string

app = Flask(__name__)

# --- Logging ---
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# --- Config file for persistence ---
CONFIG_FILE = "case_config.json"

def load_case_root():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                data = json.load(f)
                return data.get("CASE_ROOT", os.path.abspath("tutorial_cases"))
        except Exception as e:
            logger.warning(f"[WARN] Could not load config file: {e}")
    return os.path.abspath("tutorial_cases")

def save_case_root(case_root):
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump({"CASE_ROOT": case_root}, f)
    except Exception as e:
        logger.error(f"[ERROR] Could not save config file: {e}")

@app.route("/get_case_root", methods=["GET"])
def get_case_root():
    return jsonify({"caseDir": CASE_ROOT})

# --- Load OpenFOAM environment once ---
BASHRC = "/usr/lib/openfoam/openfoam2506/etc/bashrc"  # adjust if needed
command = f"bash -c 'source {BASHRC} && env'"
proc = subprocess.Popen(command, stdout=subprocess.PIPE, shell=True, executable="/bin/bash")
OPENFOAM_ENV = {}
for line in proc.stdout:
    key, _, value = line.decode().partition("=")
    OPENFOAM_ENV[key.strip()] = value.strip()
proc.communicate()

# Tutorials list
FOAM_TUTORIALS = OPENFOAM_ENV.get("FOAM_TUTORIALS", "")
TUTORIAL_LIST = []
if FOAM_TUTORIALS and os.path.isdir(FOAM_TUTORIALS):
    for root, dirs, files in os.walk(FOAM_TUTORIALS):
        if "system" in dirs and "constant" in dirs:
            relpath = os.path.relpath(root, FOAM_TUTORIALS)
            TUTORIAL_LIST.append(relpath)
    TUTORIAL_LIST.sort()

# --- Load HTML template ---
TEMPLATE_FILE = os.path.join("static", "foampilot_frontend.html")
with open(TEMPLATE_FILE, "r") as f:
    TEMPLATE = f.read()

# --- Global CASE_ROOT ---
CASE_ROOT = load_case_root()
logger.info(f"[INDEX] Loaded CASE_ROOT: {CASE_ROOT}")

@app.route("/")
def index():
    options = "".join([f'<option value="{t}">{t}</option>' for t in TUTORIAL_LIST])
    return render_template_string(TEMPLATE, options=options, CASE_ROOT=CASE_ROOT)

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
    save_case_root(CASE_ROOT)
    logger.debug(f"[DEBUG] [set_case] CASE_ROOT set to: {CASE_ROOT}")
    return jsonify({
        "output": f"INFO::[FOAMPilot] Case root set to: {CASE_ROOT}",
        "caseDir": CASE_ROOT
    })

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

    # Create a folder for this tutorial
    dest = os.path.join(dest_root, tutorial.replace("/", "_"))
    if not os.path.exists(dest):
        subprocess.run(["cp", "-r", src, dest])

    return jsonify({
        "output": f"INFO::[FOAMPilot] Tutorial loaded::{tutorial}\nSource: {src}\nCopied to: {dest}",
        "caseDir": dest   # <-- return the actual case folder
    })

@app.route("/run", methods=["POST"])
def run():
    data = request.get_json()
    case_dir = data.get("caseDir") or CASE_ROOT  # fallback
    command = data.get("command")

    if not case_dir or not os.path.isdir(case_dir):
        return jsonify({"output": "[FOAMPilot] [Error] Invalid case directory"})

    try:
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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
