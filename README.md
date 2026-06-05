[![License](https://img.shields.io/badge/License-GPLv3-red.svg)](https://opensource.org/licenses/GPL-3.0)
[![Python](https://img.shields.io/badge/Python-3.13%2B-f5d7e3)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.1.2-cyan)](https://flask.palletsprojects.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6)](https://www.typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3.1.6-white)](https://tailwindcss.com/)
[![OpenFOAM](https://img.shields.io/badge/OpenFOAM-v12-yellow)](https://openfoam.org/)
[![Docker](https://img.shields.io/badge/Docker-27.1.1-1d63ed)](https://www.docker.com/)
[![pydoc3](https://img.shields.io/badge/pydoc3-0.11.6-magenta.svg)](https://pdoc3.readthedocs.io/)
[![uv](https://img.shields.io/badge/uv-0.10.2-d7ff64.svg)](https://docs.astral.sh/uv/)
[![swc](https://img.shields.io/badge/swc-1.5.11-orange)](https://swc.rs/)
[![trame](https://img.shields.io/badge/trame-3.1.2-8bc392)](https://github.com/Kitware/trame)
[![pyvista](https://img.shields.io/badge/pyvista-0.46.4-5d3f3f)](https://docs.pyvista.org/)

<p align="center">
  <img src="static/icons/banner.svg" alt="FOAMFlask Banner" height="50" width="500">
</p>

**FOAMFlask** is an attempt to make a yet another lightweight web-based GUI for managing and running **OpenFOAM** tutorials and simulations. It allows users to easily select a tutorial, set a case directory, and execute OpenFOAM commands directly from a browser. Since this is targeted for beginners, the documentation has been kept as extensive as possible.

**Important**

1. Currently only loading and execution of OpenFOAM tutorials (`$FOAM_TUTORIALS`) is supported. Creating custom cases is planned.
2. Always edit files in `static/ts/` directory, never directly in `static/js/`. The `static/js/` files are overwritten during the build process.

---

## Features

- Web interface for OpenFOAM case management.
- Persistently store the **CASE_ROOT** across sessions.
- Load and copy tutorials from the OpenFOAM tutorials directory.
- Run common OpenFOAM commands (`blockMesh`, `simpleFoam`, `pimpleFoam`) with live output.
- Color-coded console output for stdout, stderr, info, and tutorial messages.
- Fully compatible with OpenFOAM 2506 (adjustable for other versions).
- **Security-hardened command execution** with input validation and injection protection.

---

## Screenshot ([More Screenshots](https://github.com/dhruvhaldar/FOAMFlask/wiki/More-Screenshots))
![FOAMFlask Geometry](Screenshots/geometry.png)

## <span style="color:blue">Stage 1 : Installation</span>

You have two options: Download a pre-built binary (easiest) or build from source using the automated installer.

### Option 1: Build from Source (Automated)

Clone the repository and run the installer script. This will automatically check for and attempt to install dependencies (Python, Node.js, pnpm), build the frontend, and start the app.

<details>
<summary><strong>Windows</strong></summary>

```powershell
# 1. One-time setup and build
.\install.ps1

# 2. Run the application
.\run.ps1
```
</details>

> [!WARNING]
> If you get an error stating that "cannot be loaded because running scripts is disabled on this system", run the script with the bypass flag:
> `powershell -ExecutionPolicy Bypass -File .\install.ps1`


<details>
<summary><strong>Linux / macOS</strong></summary>

```bash
git clone https://github.com/dhruvhaldar/FOAMFlask
cd FOAMFlask
chmod +x install.sh
./install.sh
```

</details>

> [!TIP]
> After running the automated installer, if the `uv` command is not recognized, you may need to **restart your terminal** or add the local bin directory to your PATH:
> - **Windows**: `$env:USERPROFILE\.local\bin`
> - **Linux/macOS**: `~/.local/bin`

### Option 2: Manual Installation (Developers)

If you prefer to manage the environment yourself:

1. **Install Prerequisites**: Python 3.12+, Node.js 20+, pnpm 8+, and Docker.
2. **Install Frontend**:
   ```bash
   pnpm install
   pnpm run build
   ```
3. **Install Backend**:
   ```bash
   uv sync
   ```

## <span style="color:blue">Stage 2 : Run FOAMFlask (Frontend and Backend)</span>

Windows
```powershell
# Run the application after installation
.\run.ps1
```

Linux / macOS
```bash
uv run python -m app 2>&1 | tee app.log
```
```bash
pkill -f "uv run python -m app"; sleep 1; uv run python -m app > app_output.log 2>&1 &
```
## <span style="color:blue">Stage 3 : Usage</span>

1. **Start the Application**:
   - If using the binary, just double-click it.
   - If using source on Windows: `.\run.ps1`.
   - If using source on Linux: `uv run python -m app`.

2. **Access the web interface**:
   Open your browser and navigate to `http://localhost:5000`.

3. **Access the web interface**:
   Open your browser and navigate to `http://localhost:5000`.

4. **Set a case directory**:
   Enter a path for your simulation cases.
   Click `Set Case Dir`.

5. **Set OpenFOAM root directory**:
   Enter a path for your OpenFOAM root directory.
   Click `Set OpenFOAM Root`.

6. **Load a tutorial**:
   Select a tutorial from the dropdown.
   Click `Load Tutorial`.
   The tutorial will be copied to your selected case directory.

7. **Run OpenFOAM commands**:
   Use the buttons (blockMesh, simpleFoam, pimpleFoam) to execute commands.
   Live output is shown in the console panel.

8. **Realtime Plotting**:
   - Click "Show Plots" to enable realtime polling of OpenFOAM results.
   - Plots update every 2 seconds.
   - For aerodynamic cases, click "Show Aero Plots" to see Pressure Coefficient (Cp) and Velocity Profiles.

9. **Keyboard Shortcuts**:
   - Use access keys to quickly navigate between tabs. The combination depends on your browser and OS (e.g., `Alt` + `Shift` + `Key` on Windows Firefox).
   - `s`: Setup
   - `g`: Geometry
   - `m`: Meshing
   - `v`: Visualizer
   - `r`: Run/Log
   - `p`: Plots
   - `o`: Post

---

## <span style="color:blue">Stage 4 : Development</span>

> [!NOTE]
> This section is intended for developers who wish to contribute to or modify FOAMFlask.

### Project Structure

```text
FOAMFlask/
├── app.py # Main Flask application
├── case_config.json # Stores the last used CASE_ROOT
├── package.json # Node.js dependencies and build scripts
├── copy-built-js.mjs # Custom build script
├── static/
│ ├── html/
│ │ └── foamflask_frontend.html # HTML template
│ ├── ts/
│ │ └── foamflask_frontend.ts # TypeScript source code
│ ├── js/
│ │ ├── foamflask_frontend.js # Compiled JavaScript (for browser)
│ │ └── frontend/
│ │     └── isosurface.js # PyVista integration
│ ├── js-build/
│ │ └── foamflask_frontend.js # TypeScript compiler output
├── backend/
│ ├── geometry/
│ │ └── manager.py # Geometry management utilities
│ ├── mesh/
│ │ └── mesher.py # Mesh generation utilities
│ ├── plots/
│ │ └── realtime_plots.py # Real-time plotting backend
│ ├── post/
│ │ └── isosurface.py # Post-processing utilities
│ ├── verification/
│ │ └── verify_changes.py # Verification utilities
├── test/
│ ├── check_coverage.py # Code coverage analysis script
│ ├── check_docstrings.py # Docstring coverage checker
│ ├── docker_test.py # Docker functionality tests
│ ├── pyvista_test.py # PyVista integration tests
│ ├── foamlib_test.py # FOAM library tests
│ └── bike.vtp # Test VTK file
├── docs/ # Generated documentation
├── environments/ # Python virtual environments
└── README.md # This file
```

---

## [Key Locations] (https://github.com/dhruvhaldar/FOAMFlask/wiki/Developer-Documentation#key-locations)

## [Tech Stack & Frameworks](https://github.com/dhruvhaldar/FOAMFlask/wiki/Developer-Documentation#tech-stack--frameworks)

## [Troubleshooting & FAQ](https://github.com/dhruvhaldar/FOAMFlask/wiki/Troubleshooting-&-FAQ)

## [Testing](https://github.com/dhruvhaldar/FOAMFlask/wiki/Developer-Documentation#testing)

## License

FOAMFlask is released under the [GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html) License.
