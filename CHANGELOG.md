# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Initial CHANGELOG.md file to track project changes
- Additional OpenFOAM solver support
- Enhanced mesh quality analysis
- Batch simulation capabilities
- Remote case management
- Advanced post-processing tools
- Export capabilities for plots and data
- User authentication and multi-user support
- WebSocket support for improved real-time updates

---

## [0.1.0] - 2025-11-19

### Added
- **Web-based GUI** for managing and running OpenFOAM tutorials and simulations
- **Tutorial management** system for loading and copying OpenFOAM tutorials
- **Persistent configuration** storing CASE_ROOT across sessions via `case_config.json`
- **Real-time command execution** for common OpenFOAM commands:
  - `blockMesh` for mesh generation
  - `simpleFoam` for steady-state incompressible flows
  - `pimpleFoam` for transient incompressible flows
- **Live output console** with color-coded messages (stdout, stderr, info, tutorial)
- **Real-time plotting system** using Plotly.js:
  - Universal compatibility with all OpenFOAM cases
  - Automatic field detection (p, U, nut, nuTilda, k, epsilon, omega, T, etc.)
  - Updates every 2 seconds during simulation
  - Multiple plot types: pressure, velocity components, turbulence properties, residuals
  - Aerodynamic analysis with Cp and 3D velocity profiles
- **Interactive mesh viewer** using PyVista for 3D visualization
- **Isosurface generation** capabilities for post-processing
- **Custom OpenFOAM parser** in `realtime_plots.py` for field file reading
- **Flask API endpoints** for serving plot data and managing simulations
- **Build utilities** (`build.py`, `build_utils.py`) for project setup
- **Comprehensive documentation**:
  - README.md with installation and usage instructions
  - API documentation generation via pdoc3
  - Interactive mesh viewer guide (INTERACTIVE_MESH_VIEWER.md)
  - PyVista integration documentation (PYVISTA_INTEGRATION.md)
- **Project governance**:
  - GPLv3 License
  - Code of Conduct
  - Contributing guidelines
  - Security policy
  - Issue templates for bug reports
  - Pull request template

### Technical Stack
- **Backend**: Flask 3.1.3, Python 3.13+
- **Frontend**: Tailwind CSS 3.1.6, Plotly.js 3.3.1 for interactive plots
- **Visualization**: PyVista 0.46.4, VTK 9.5.2, trame for 3D rendering
- **OpenFOAM**: Compatible with OpenFOAM 2506 (adjustable for other versions)
- **Additional libraries**: 
  - meshio 5.3.5 for mesh I/O
  - netCDF4 1.7.3 for data handling
  - numpy 2.3.4 for numerical operations
  - matplotlib 3.10.7 for plotting utilities

### Project Structure
```
FOAMFlask/
├── app.py                          # Main Flask application
├── case_config.json                # Configuration storage
├── backend/
│   ├── mesh/mesher.py              # Mesh generation utilities
│   ├── plots/realtime_plots.py     # Real-time plotting engine
│   ├── post/isosurface.py          # Isosurface post-processing
│   └── visualization/              # Visualization components
├── static/
│   ├── html/                       # HTML templates
│   ├── js/                         # JavaScript frontend logic
│   └── icons/                      # UI icons (Plotly, PyVista)
├── docs/                           # Documentation files
├── test/                           # Test files and sample data
└── requirements.txt                # Python dependencies
```

---



[Unreleased]: https://github.com/dhruvhaldar/FOAMFlask/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/dhruvhaldar/FOAMFlask/releases/tag/v0.1.0
