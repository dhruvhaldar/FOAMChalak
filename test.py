import os
import subprocess
import logging
from flask import Flask, request, jsonify, render_template_string

app = Flask(__name__)

# --- Logging ---
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

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

# --- HTML Template ---
TEMPLATE = """
<!doctype html>
<html>
<head>
  <title>OpenFOAM Web GUI</title>
</head>
<body style="font-family: sans-serif; margin:20px;">
  <h1>OpenFOAM Web GUI</h1>

  <h3>Select Tutorial</h3>
  <select id="tutorialSelect">
    {{ options|safe }}
  </select>
  <button onclick="loadTutorial()">Load Tutorial</button>

  <h3>Or Set Case Directory</h3>
  <form id="caseForm">
    <label>Case Directory:</label>
    <input type="text" id="caseDir" name="caseDir" size="60" />
    <button type="button" onclick="setCase()">Set Case</button>
  </form>
  <br>

  <button onclick="runCommand('blockMesh')">Run blockMesh</button>
  <button onclick="runCommand('simpleFoam')">Run simpleFoam</button>

  <pre id="output" style="background:#eee; padding:10px; height:300px; overflow:auto;"></pre>

<script>
{% raw %}
let caseDir = "";

function setCase() {
  caseDir = document.getElementById("caseDir").value;
  document.getElementById("output").innerText += "Case set to: " + caseDir + "\\n";
}

function loadTutorial() {
  const selected = document.getElementById("tutorialSelect").value;
  fetch("/load_tutorial", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({tutorial: selected})
  }).then(r => r.json()).then(data => {
    caseDir = data.caseDir;
    document.getElementById("caseDir").value = caseDir;
    document.getElementById("output").innerText += data.output + "\\n";
  });
}

function runCommand(cmd) {
  fetch("/run", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({caseDir: caseDir, command: cmd})
  }).then(r => r.json()).then(data => {
    document.getElementById("output").innerText += data.output + "\\n";
  });
}
{% endraw %}
</script>

</body>
</html>
"""

@app.route("/")
def index():
    options = "".join([f'<option value="{t}">{t}</option>' for t in TUTORIAL_LIST])
    return render_template_string(TEMPLATE, options=options)

# --- Global cache for case root ---
CASE_ROOT = os.path.abspath("tutorial_cases")  # default if nothing set


@app.route("/set_case", methods=["POST"])
def set_case():
    global CASE_ROOT
    data = request.get_json()
    case_dir = data.get("caseDir")
    if not case_dir:
        return jsonify({"output": "[Error] No caseDir provided"})
    case_dir = os.path.abspath(case_dir)
    os.makedirs(case_dir, exist_ok=True)
    CASE_ROOT = case_dir
    logger.debug(f"[DEBUG] [set_case] CASE_ROOT set to: {CASE_ROOT}")
    return jsonify({"output": f"Case root set to: {CASE_ROOT}", "caseDir": CASE_ROOT})

@app.route("/load_tutorial", methods=["POST"])
def load_tutorial():
    data = request.get_json()
    tutorial = data.get("tutorial")
    if not tutorial:
        return jsonify({"output": "[Error] No tutorial selected", "caseDir": ""})
    src = os.path.join(FOAM_TUTORIALS, tutorial)
    dest_root = os.path.abspath("tutorial_cases")
    logger.debug(f"[DEBUG] [load_tutorial] src: {src}")
    logger.debug(f"[DEBUG] [load_tutorial] dest_root: {dest_root}")
    os.makedirs(dest_root, exist_ok=True)
    dest = os.path.join(dest_root, tutorial.replace("/", "_"))
    if not os.path.exists(dest):
        subprocess.run(["cp", "-r", src, dest])
    return jsonify({"output": f"Tutorial loaded: {tutorial}\nSource: {src}\nCopied to: {dest_root}",
                    "caseDir": dest_root})

@app.route("/run", methods=["POST"])
def run():
    data = request.get_json()
    case_dir = data.get("caseDir")
    command = data.get("command")
    logger.debug(f"[DEBUG] [run] case_dir: {case_dir}")
    logger.debug(f"[DEBUG] [run] command: {command}")
    if not case_dir or not os.path.isdir(case_dir):
        return jsonify({"output": "[Error] Invalid case directory"})
    try:
        proc = subprocess.run(
            command,
            cwd=case_dir,
            shell=True,
            capture_output=True,
            text=True,
            env={**os.environ, **OPENFOAM_ENV}
        )
        return jsonify({"output": f"$ {command}\\n{proc.stdout}\\n{proc.stderr}"})
    except Exception as e:
        return jsonify({"output": str(e)})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)