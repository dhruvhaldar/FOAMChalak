[![Python](https://img.shields.io/badge/Python-3.8%2B-f5d7e3)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.1.2-cyan)](https://flask.palletsprojects.com/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3.3.0-white)](https://tailwindcss.com/)
[![OpenFOAM](https://img.shields.io/badge/OpenFOAM-v2412-green)](https://openfoam.org/)
[![License](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://opensource.org/licenses/GPL-3.0)

# FOAMचालक

**FOAMChalak** is a modern web-based GUI for managing and running **OpenFOAM** simulations. It provides a user-friendly interface to run OpenFOAM commands, monitor simulations in real-time, and view outputs directly in your browser.

Pronounced `FOAMChaluck`.

---

## Features

- 🚀 Modern, responsive web interface built with Flask and Tailwind CSS
- 🐳 Docker container management for OpenFOAM environments
- 📊 Real-time simulation output streaming
- ⚡ WebSocket-based communication for live updates
- 📂 File browser for case directory navigation
- 🎨 Clean, intuitive UI with status indicators
- 🔄 Background process management
- 📱 Mobile-responsive design

## Supported OpenFOAM Versions

- Ubuntu Noble with OpenFOAM v2412 (default)
- OpenFOAM 10 with ParaView 5.6
- OpenFOAM 9
- OpenFOAM 8

## Installation

1. **Clone the repository**:

```bash
git clone https://github.com/dhruvhaldar/FOAMChalak
cd FOAMChalak
```

2. **Create and activate a virtual environment (recommended)**:
```bash
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
```

3. **Install dependencies**:
```bash
pip install -r requirements.txt
```

## Usage

1. **Run the application**:
```bash
python app.py
```

2. **Access the web interface**:
Open your browser and navigate to [http://localhost:5000](http://localhost:5000)

3. **Using the interface**:
   - Select a Docker image from the dropdown
   - Set your case directory (or use the default tutorial)
   - Click "Run Simulation" to start
   - Monitor the output in real-time
   - Use "Stop" to terminate the simulation if needed

## Project Structure

```
FOAMChalak/
├── app.py                 # Main Flask application
├── foamlib_docker_test.py # Core OpenFOAM Docker functionality
├── requirements.txt       # Python dependencies
├── static/                # Static files
│   ├── css/              # CSS files
│   └── js/               # JavaScript files
│       └── main.js       # Frontend logic
├── templates/            # HTML templates
│   ├── base.html         # Base template
│   └── index.html        # Main interface
└── README.md             # This file
```

## Development

To modify the frontend:
1. Edit files in the `templates/` and `static/` directories
2. The app will automatically reload when Python files change
3. For production, you may want to build and minify the static assets

## License

FOAMChalak is released under the GPLv3 License.
