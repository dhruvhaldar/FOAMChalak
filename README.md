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

**FOAMFlask** is an attempt to make a yet another lightweight web-based GUI for managing and running **OpenFOAM** tutorials and simulations. It allows users to easily select a tutorial, set a case directory, and execute OpenFOAM commands directly from a browser. Since this is targeted for beginners, the documentation has been kept as extensive as possible. FOAMFlask works on Windows, Linux and MacOS.

**Important**

1. ~~Currently only loading and execution of OpenFOAM tutorials (`$FOAM_TUTORIALS`) is supported. Creating custom cases is planned.~~

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

## [Installation](https://github.com/dhruvhaldar/FOAMFlask/wiki/Installation-&-Setup#option-1-build-from-source-automated)

## [Usage](https://github.com/dhruvhaldar/FOAMFlask/wiki/User-Guide:-Managing-Cases-&-Simulations#usage)

## [Project Structure](https://github.com/dhruvhaldar/FOAMFlask/wiki/Developer-Documentation#project-structure)

## [Key Locations](https://github.com/dhruvhaldar/FOAMFlask/wiki/Developer-Documentation#key-locations)

## [Architecture](https://github.com/dhruvhaldar/FOAMFlask/wiki/Developer-Documentation#tech-stack--frameworks)

## [Troubleshooting & FAQ](https://github.com/dhruvhaldar/FOAMFlask/wiki/Troubleshooting-&-FAQ)

## [Testing](https://github.com/dhruvhaldar/FOAMFlask/wiki/Developer-Documentation#testing)

## License

FOAMFlask is released under the [GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html) License.
