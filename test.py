import os
import subprocess
from flask import Flask, request, jsonify, render_template_string

app = Flask(__name__)

# --- Load OpenFOAM environment once ---
BASHRC = "/usr/lib/openfoam/openfoam2506/etc/bashrc"  # update if different version/path
command = f"bash -c 'source {BASHRC} && env'"
proc = subprocess.Popen(command, stdout=subprocess.PIPE, shell=True, executable="/bin/bash")
OPENFOAM_ENV = {}
for line in proc.stdout:
    key, _, value = line.decode().partition("=")
    OPENFOAM_ENV[key.strip()] = value.strip()
proc.communicate()

# --- HTML Template ---
TEMPLATE = """
<!doctype html>
<html>
<head>
  <title>OpenFOAM Web GUI</title>
</head>
<body style="font-family: sans-serif; margin:20px;">
  <h1>OpenFOAM Web GUI</h1>
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
let caseDir = "";
function setCase() {
  caseDir = document.getElementById("caseDir").value;
  document.getElementById("output").innerText += "Case set to: " + caseDir + "\\n";
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
</script>
</body>
</html>
"""

@app.route("/")
def index():
    return render_template_string(TEMPLATE)

@app.route("/run", methods=["POST"])
def run():
    data = request.get_json()
    case_dir = data.get("caseDir")
    command = data.get("command")
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