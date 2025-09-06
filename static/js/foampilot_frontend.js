let caseDir = "";        // will be fetched from server on load
let openfoamRoot = "";   // will be fetched from server on load

// --- Initialize on page load ---
window.onload = () => {
  // Fetch CASE_ROOT
  fetch("/get_case_root")
    .then(r => r.json())
    .then(data => {
      caseDir = data.caseDir || "";
      document.getElementById("caseDir").value = caseDir;
    });

  // Fetch OPENFOAM_ROOT
  fetch("/get_openfoam_root")
    .then(r => r.json())
    .then(data => {
      openfoamRoot = data.openfoamRoot || "";
      document.getElementById("openfoamRoot").value = openfoamRoot;
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

// --- Set OpenFOAM root directory ---
function setOpenFOAMRoot(path) {
  openfoamRoot = path;
  fetch("/set_openfoam_root", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({openfoamRoot: openfoamRoot})
  })
  .then(r => r.json())
  .then(data => {
    openfoamRoot = data.openfoamRoot;
    document.getElementById("openfoamRoot").value = openfoamRoot;

    appendOutput(`OpenFOAM root set to: ${openfoamRoot}`, "info");
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
    caseDir = data.caseDir;
    document.getElementById("caseDir").value = caseDir;

    // Optional: persist loaded tutorial as new CASE_ROOT
    fetch("/set_case", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseDir: caseDir })
    });

    data.output.split('\n').forEach(line => {
      line = line.trim();
      if(line.startsWith("INFO::[FOAMPilot] Tutorial loaded::")) {
        appendOutput(line.replace("INFO::[FOAMPilot] Tutorial loaded::","Tutorial loaded: "), "tutorial");
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
  fetch("/run", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({caseDir: caseDir, command: cmd})
  })
  .then(r => r.json())
  .then(data => {
    data.output.split('\n').forEach(line => {
      const type = /error/i.test(line) ? "stderr" : "stdout";
      appendOutput(line, type);
    });
  });
}