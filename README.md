![Flask](https://img.shields.io/badge/Flask-3.1.2-blue)
![Tailwind](https://img.shields.io/badge/Tailwind-3.1.6-white)
![Python](https://img.shields.io/badge/Python-3.11-orange)
![OpenFOAM](https://img.shields.io/badge/OpenFOAM-2506-green)


# FOAMPilot

**FOAMPilot** is a lightweight web-based GUI for managing and running **OpenFOAM** tutorials and simulations. It allows users to easily select a tutorial, set a case directory, and execute OpenFOAM commands directly from a browser.

---

## Features

- Web interface for OpenFOAM case management.
- Persistently store the **CASE_ROOT** across sessions.
- Load and copy tutorials from the OpenFOAM tutorials directory.
- Run common OpenFOAM commands (`blockMesh`, `simpleFoam`, `pimpleFoam`) with live output.
- Color-coded console output for stdout, stderr, info, and tutorial messages.
- Fully compatible with OpenFOAM 2506 (adjustable for other versions).

---

## Installation

1. **Clone the repository**:

```bash
git clone https://github.com/dhruvhaldar/FOAMPilot
cd FOAMPilot
```

2. **Install dependencies**:
```bash
pip install -r requirements.txt
```

## Usage
1. **Run the server**:
```bash
python app.py
```
2. **Access the web interface**:
Open your browser and navigate to `http://localhost:5000`.

3. **Set a case directory**:
Enter a path for your simulation cases.
Click `Set Case Dir`.

4. **Set OpenFOAM root directory**:
Enter a path for your OpenFOAM root directory.
Click `Set OpenFOAM Root`.

5. **Load a tutorial**:
Select a tutorial from the dropdown.
Click `Load Tutorial`.
The tutorial will be copied to your selected case directory.

6. **Run OpenFOAM commands**:
Use the buttons (blockMesh, simpleFoam, pimpleFoam) to execute commands.
Live output is shown in the console panel.

---

## Project Structure
```
FOAMPilot/
├── app.py # Main Flask application
├── case_config.json # Stores the last used CASE_ROOT
├── static/
│ ├── foampilot_frontend.html # HTML template
│ └── js/foampilot_frontend.js # JavaScript logic
├── my-py-env/ # Optional: local Python virtual environment
├── requirements.txt # Python dependencies
└── README.md # This file
```

---
