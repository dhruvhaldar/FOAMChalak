# FOAMPilot - Software Specification Document

## 1. System Overview
FOAMPilot is a web-based interface for OpenFOAM simulations, providing a user-friendly way to manage, run, and visualize computational fluid dynamics (CFD) cases. The application bridges the gap between complex OpenFOAM commands and end-users through an intuitive web interface.

## 2. Technical Stack

### Backend
- **Framework**: Flask 3.x (Python 3.13+)
- **Containerization**: Docker SDK for Python
- **API**: RESTful JSON API
- **Concurrency**: Thread-based for background tasks
- **Logging**: Python logging module (DEBUG level)

### Frontend
- **Core**: Vanilla JavaScript
- **UI Framework**: Custom HTML/CSS with responsive design
- **Templating**: Flask Jinja2 templates
- **WebSockets**: For real-time log streaming

### Data Management
- **Configuration**: JSON-based configuration files
- **Session Management**: Client-side storage (localStorage)
- **Data Persistence**: File system-based storage for simulation data

## 3. Core Functionality

### 3.1 Case Management
- Create and manage OpenFOAM tutorial cases
- Set and modify case root directories
- Load and run standard OpenFOAM tutorials
- Support for custom case configurations

### 3.2 Simulation Control
- Start/stop simulations
- Real-time log streaming
- Progress monitoring
- Error handling and reporting

### 3.3 Visualization
- Real-time plotting of simulation data
- 3D mesh visualization
- Interactive isosurface generation
- Screenshot generation of visualizations
- Streamline visualization
- Volume rendering
- Custom colormaps

### 3.4 User Management
- Multi-user support
- Authentication/authorization

### 3.5 Batch Processing
- Parameter sweeps
- Job queuing
- Remote execution

### 3.6 Integration
- Jupyter notebook support
- REST API for programmatic access
- Plugin system for custom solvers

## 4. API Endpoints

### Case Management
- `GET /` - Main application interface
- `GET /get_case_root` - Get current case directory
- `POST /set_case` - Set case root directory
- `GET /get_docker_config` - Get Docker configuration
- `POST /set_docker_config` - Update Docker settings

### Simulation Control
- `POST /load_tutorial` - Load tutorial case
- `POST /run` - Execute simulation
- `GET /stream_logs` - Stream simulation logs (SSE)

### Visualization
- `GET /api/available_fields` - List available data fields
- `GET /api/plot_data` - Get data for plotting
- `GET /api/latest_data` - Get latest simulation data
- `GET /api/residuals` - Get convergence data

### 3D Visualization
- `GET /api/available_meshes` - List available mesh files
- `POST /api/load_mesh` - Load mesh data
- `POST /api/mesh_screenshot` - Generate mesh screenshots
- `POST /api/mesh_interactive` - Get interactive viewer
- `POST /api/contours/create` - Generate isosurfaces

## 5. User Interface

### Main Components
1. **Header**
   - Application title
   - Navigation menu
   - Status indicators

2. **Case Management Panel**
   - Tutorial selection dropdown
   - Case directory configuration
   - Docker settings

3. **Simulation Control**
   - Action buttons (Run, Stop, etc.)
   - Real-time output console
   - Progress indicators

4. **Visualization Area**
   - 2D plots
   - 3D viewer
   - Control panels for visualization parameters

## 6. Data Flow

1. **Initialization**
   - Load configuration
   - Initialize Docker client
   - Scan for available tutorials

2. **Simulation Execution**
   - User selects tutorial and parameters
   - Backend prepares case directory
   - Docker container executes OpenFOAM commands
   - Real-time logs streamed to frontend

3. **Visualization**
   - Simulation data processed
   - Visualizations generated
   - Interactive controls provided

## 7. Security Considerations

- Input validation on all API endpoints
- Sanitization of file paths
- Container isolation for simulations
- CORS configuration for development

## 8. Performance Considerations

- Asynchronous log streaming
- Caching of frequently accessed data
- Efficient mesh data handling
- Progressive loading of large datasets

## 9. Dependencies

### Python Packages
- Flask
- docker
- numpy
- pyvista
- vtk

### System Requirements
- Docker Engine
- Python 3.13+
- Modern web browser (Chrome, Firefox, Edge)

## 10. Error Handling

- Comprehensive error logging
- User-friendly error messages
- Graceful degradation of features
- Automatic recovery where possible


