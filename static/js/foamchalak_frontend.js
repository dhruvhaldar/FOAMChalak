let caseDir = "";        // will be fetched from server on load
let dockerImage = "";    // from server
let openfoamVersion = ""; // from server

// --- Initialize on page load ---
window.onload = () => {
  // Fetch CASE_ROOT
  fetch("/get_case_root")
    .then(r => r.json())
    .then(data => {
      caseDir = data.caseDir || "";
      document.getElementById("caseDir").value = caseDir;
    });

  // Fetch Docker config (instead of OPENFOAM_ROOT)
  fetch("/get_docker_config")
    .then(r => r.json())
    .then(data => {
      dockerImage = data.dockerImage || "";
      openfoamVersion = data.openfoamVersion || "";
      document.getElementById("openfoamRoot").value =
        `${dockerImage} (OpenFOAM ${openfoamVersion})`;
    });
};

// --- Append output helper ---
function appendOutput(message, type="stdout") {
  const container = document.getElementById("output");
  const line = document.createElement("div");

  if(type === "stderr") line.className = "text-red-600";
  else if(type === "tutorial") line.className = "text-blue-600 font-semibold";
  else if(type === "info") line.className = "text-yellow-600 italic";
  else line.className = "text-green-700";

  line.textContent = message;
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

// --- Set case directory manually ---
function setCase() {
  caseDir = document.getElementById("caseDir").value;
  fetch("/set_case", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({caseDir: caseDir})
  })
  .then(r => r.json())
  .then(data => {
    caseDir = data.caseDir;
    document.getElementById("caseDir").value = caseDir;

    data.output.split('\n').forEach(line => {
      line = line.trim();
      if(line.startsWith("INFO::")) appendOutput(line.replace("INFO::",""), "info");
      else if(line.startsWith("[Error]")) appendOutput(line, "stderr");
      else appendOutput(line, "stdout");
    });
  });
}

// --- Update Docker config (instead of OpenFOAM root) ---
function setDockerConfig(image, version) {
  dockerImage = image;
  openfoamVersion = version;
  fetch("/set_docker_config", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      dockerImage: dockerImage,
      openfoamVersion: openfoamVersion
    })
  })
  .then(r => r.json())
  .then(data => {
    dockerImage = data.dockerImage;
    openfoamVersion = data.openfoamVersion;
    document.getElementById("openfoamRoot").value =
      `${dockerImage} (OpenFOAM ${openfoamVersion})`;

    appendOutput(`Docker config set to: ${dockerImage} (OpenFOAM ${openfoamVersion})`, "info");
  });
}

// --- Load a tutorial ---
function loadTutorial() {
  const selected = document.getElementById("tutorialSelect").value;
  fetch("/load_tutorial", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({tutorial: selected})
  })
  .then(r => r.json())
  .then(data => {
    // Do not overwrite caseDir input — keep it as the run folder
    data.output.split('\n').forEach(line => {
      line = line.trim();
      if(line.startsWith("INFO::[FOAMChalak] Tutorial loaded::")) {
        appendOutput(line.replace("INFO::[FOAMChalak] Tutorial loaded::","Tutorial loaded: "), "tutorial");
      } else if(line.startsWith("Source:") || line.startsWith("Copied to:")) {
        appendOutput(line, "info");
      } else {
        const type = /error/i.test(line) ? "stderr" : "stdout";
        appendOutput(line, type);
      }
    });
  });
}

// --- Run OpenFOAM commands ---
function runCommand(cmd) {
  if (!cmd) {
    appendOutput("Error: No command specified!", "stderr");
    return;
  }
  const selectedTutorial = document.getElementById("tutorialSelect").value;
  const outputDiv = document.getElementById("output");
  outputDiv.innerHTML = ""; // clear previous output

  fetch("/run", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      caseDir: caseDir,
      tutorial: selectedTutorial,
      command: cmd
    })
  }).then(response => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    function read() {
      reader.read().then(({done, value}) => {
        if (done) return;
        const text = decoder.decode(value);
        text.split("\n").forEach(line => {
          if (!line.trim()) return;
          const type = /error/i.test(line) ? "stderr" : "stdout";
          appendOutput(line, type);
        });
        read();
      });
    }
    read();
  });
}

