from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit
import os
import sys
import subprocess
import threading
import json
import time
import shutil
import psutil
import docker
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*")

# Global variables to store process information
current_process = None
process_output = []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/run_simulation', methods=['POST'])
def run_simulation():
    global current_process
    
    if current_process and current_process.poll() is None:
        return jsonify({'status': 'error', 'message': 'A simulation is already running'}), 400
    
    # Initialize variables that need cleanup in case of error
    run_dir = None
    
    try:
        # Get the path to the Python interpreter in the virtual environment
        python_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'venv', 'bin', 'python')
        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'foamlib_docker_test.py')
        
        # Verify that the script exists
        if not os.path.exists(script_path):
            raise FileNotFoundError(f"Simulation script not found at {script_path}")
        
        # Create base directory for runs if it doesn't exist
        base_runs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'runs')
        os.makedirs(base_runs_dir, exist_ok=True, mode=0o755)
        
        # Create a timestamped run directory with required subdirectories
        timestamp = time.strftime('%Y%m%d_%H%M%S')
        run_dir = os.path.join(base_runs_dir, f'run_{timestamp}')
        
        # Ensure the run directory is created with the correct permissions
        try:
            os.makedirs(run_dir, mode=0o755, exist_ok=True)
            os.chmod(run_dir, 0o755)  # Ensure directory is writable
            
            # Create necessary subdirectories
            for subdir in ['0', 'constant', 'system']:
                os.makedirs(os.path.join(run_dir, subdir), mode=0o755, exist_ok=True)
                
        except Exception as e:
            error_msg = f"Failed to create run directory {run_dir}: {str(e)}"
            print(f"❌ {error_msg}")
            return jsonify({
                'status': 'error',
                'message': error_msg
            }), 500
            
    except Exception as e:
        error_msg = f"Initialization error: {str(e)}"
        print(f"❌ {error_msg}")
        return jsonify({
            'status': 'error',
            'message': error_msg
        }), 500
        
        # Copy tutorial files from the Docker container
        tutorial_src = "/usr/lib/openfoam/openfoam2412/tutorials/incompressible/simpleFoam/pitzDaily"
        try:
            print(f"📂 Copying tutorial files from {tutorial_src} to {run_dir}")
            
            # Run a container to copy files from the tutorial directory with correct user permissions
            copy_cmd = [
                'docker', 'run', '--rm',
                '-u', f"{os.getuid()}:{os.getgid()}",  # Run as current user
                '-v', f"{run_dir}:/target",
                '--workdir', '/target',
                'haldardhruv/ubuntu_noble_openfoam:v2412',
                'bash', '-c', (
                    # Create destination directories first
                    'mkdir -p /target/0 /target/constant /target/system && ' \
                    # Copy files from each directory separately to avoid permission issues
                    'cp -r /usr/lib/openfoam/openfoam2412/tutorials/incompressible/simpleFoam/pitzDaily/0/* /target/0/ && ' \
                    'cp -r /usr/lib/openfoam/openfoam2412/tutorials/incompressible/simpleFoam/pitzDaily/constant/* /target/constant/ && ' \
                    'cp -r /usr/lib/openfoam/openfoam2412/tutorials/incompressible/simpleFoam/pitzDaily/system/* /target/system/ && ' \
                    # Set correct permissions on all files and directories
                    'find /target -type d -exec chmod 755 {} \; && ' \
                    'find /target -type f -exec chmod 644 {} \; && ' \
                    # Make sure key executables have execute permissions
                    'chmod 755 /target/All* /target/Allrun* /target/Allclean* 2>/dev/null || true'
                )
            ]
            
            # Run the copy command and capture output
            try:
                copy_process = subprocess.run(
                    copy_cmd,
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True
                )
                
                # Print command output for debugging
                if copy_process.stdout:
                    print(f"Copy command output: {copy_process.stdout}")
                
                print("✅ Successfully copied tutorial files")
                
                # Verify essential files were copied
                required_files = [
                    '0/U', '0/p', '0/nut', '0/k', '0/epsilon', '0/omega', '0/nuTilda',
                    'system/controlDict', 'system/fvSchemes', 'system/fvSolution', 
                    'system/blockMeshDict', 'constant/transportProperties',
                    'constant/turbulenceProperties'
                ]
                
                missing_files = []
                for file in required_files:
                    file_path = os.path.join(run_dir, file)
                    if not os.path.exists(file_path):
                        missing_files.append(file)
                
                if missing_files:
                    raise FileNotFoundError(
                        f"The following required files were not copied: {', '.join(missing_files)}. "
                        f"Please check if the tutorial files exist in the Docker container."
                    )
                    
            except subprocess.CalledProcessError as e:
                error_msg = (
                    f"Failed to copy tutorial files. Command failed with code {e.returncode}.\n"
                    f"Error output: {e.stderr}\n"
                    f"Command: {' '.join(copy_cmd[:5])} [command truncated]"
                )
                print(f"❌ {error_msg}")
                return jsonify({
                    'status': 'error',
                    'message': error_msg
                }), 500
                    
        except subprocess.CalledProcessError as e:
            error_msg = f"Failed to copy tutorial files: {e.stderr}"
            print(f"❌ {error_msg}")
            return jsonify({
                'status': 'error',
                'message': error_msg
            }), 500
        except Exception as e:
            error_msg = f"Error setting up tutorial case: {str(e)}"
            print(f"❌ {error_msg}")
            return jsonify({
                'status': 'error',
                'message': error_msg
            }), 500
        
        # Set environment variables
        env = os.environ.copy()
        env['PYTHONUNBUFFERED'] = '1'  # Ensure output is not buffered
        env['FOAMCHALAK_RUN_DIR'] = run_dir
        
        # Ensure log directory exists
        log_dir = os.path.dirname(run_dir)
        if not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True, mode=0o755)
            
        # Log the start of the simulation
        log_file = os.path.join(run_dir, 'simulation.log')
        try:
            with open(log_file, 'w') as f:
                f.write(f"Starting simulation at {time.ctime()}\n")
                f.write(f"Run directory: {run_dir}\n")
                f.write("=" * 80 + "\n\n")
        except IOError as e:
            app.logger.error(f"Failed to create log file {log_file}: {str(e)}")
            return jsonify({
                'status': 'error', 
                'message': f'Failed to create log file: {str(e)}'
            }), 500
        
        # Copy tutorial files from the Docker container
        tutorial_src = "/usr/lib/openfoam/openfoam2412/tutorials/incompressible/simpleFoam/pitzDaily"
        try:
            # Run a container to copy files from the tutorial directory
            copy_cmd = [
                'docker', 'run', '--rm',
                '-v', f"{run_dir}:/target",
                'haldardhruv/ubuntu_noble_openfoam:v2412',
                'bash', '-c', f"source /usr/lib/openfoam/openfoam2412/etc/bashrc && "
                            f"cp -r {tutorial_src}/* /target/ && "
                            f"chmod -R 755 /target"
            ]
            
            copy_process = subprocess.run(
                copy_cmd,
                check=True,
                capture_output=True,
                text=True
            )
            print("✅ Copied tutorial files to run directory")
            
            # Verify essential files were copied
            required_files = [
                '0/U', '0/p', 'system/controlDict',
                'system/fvSchemes', 'system/fvSolution', 'constant/polyMesh/blockMeshDict'
            ]
            
            for file in required_files:
                if not os.path.exists(os.path.join(run_dir, file)):
                    raise FileNotFoundError(f"Required file {file} was not copied from the tutorial")
                    
        except subprocess.CalledProcessError as e:
            error_msg = f"Failed to copy tutorial files: {e.stderr}"
            print(f"❌ {error_msg}")
            return jsonify({
                'status': 'error',
                'message': error_msg
            }), 500
            
        # Store process information
        process_info = {
            'start_time': time.time(),
            'run_dir': run_dir,
            'log_file': log_file,
            'current_step': 'initializing',
            'steps': [
                {'name': 'blockMesh', 'status': 'pending'},
                {'name': 'checkMesh', 'status': 'pending'},
                {'name': 'potentialFoam', 'status': 'pending'},
                {'name': 'simpleFoam', 'status': 'pending'},
                {'name': 'postProcessing', 'status': 'pending'}
            ]
        }
        
        # Function to update step status
        def update_step_status(step_name, status):
            for step in process_info['steps']:
                if step['name'] == step_name:
                    step['status'] = status
                    socketio.emit('step_update', {
                        'step': step_name,
                        'status': status,
                        'timestamp': time.time()
                    })
                    break
        
        # Function to run a single OpenFOAM command
        def run_of_command(command, step_name=None, cwd=None):
            if step_name:
                update_step_status(step_name, 'running')
                socketio.emit('output', {
                    'data': f"\n🚀 Running {step_name}...\n",
                    'timestamp': time.time(),
                    'run_id': os.path.basename(run_dir)
                })
            
            # Prepare the command to run in the container with correct user permissions and environment
            cmd = [
                'docker', 'run', '--rm',
                '-u', f"{os.getuid()}:{os.getgid()}",  # Run as current user
                '-v', f"{run_dir}:/case",
                '-w', '/case',
                # Set environment variables
                '-e', 'FOAM_RUN=/case',
                '-e', 'WM_PROJECT_USER_DIR=/case',
                '-e', 'FOAM_USER_LIBBIN=/case/platforms/linux64GccDPInt32Opt/lib',
                '-e', 'FOAM_USER_APPBIN=/case/platforms/linux64GccDPInt32Opt/bin',
                '--hostname', 'openfoam-container',
                'haldardhruv/ubuntu_noble_openfoam:v2412',
                'bash', '-c', (
                    # Initialize OpenFOAM environment
                    'source /usr/lib/openfoam/openfoam2412/etc/bashrc && ' \
                    # Ensure necessary directories exist
                    'mkdir -p /case/platforms/linux64GccDPInt32Opt/{bin,lib} && ' \
                    # Set environment variables
                    'export FOAM_RUN=/case && ' \
                    'export WM_PROJECT_USER_DIR=/case && ' \
                    'export FOAM_USER_LIBBIN=/case/platforms/linux64GccDPInt32Opt/lib && ' \
                    'export FOAM_USER_APPBIN=/case/platforms/linux64GccDPInt32Opt/bin && ' \
                    'export LD_LIBRARY_PATH=/case/platforms/linux64GccDPInt32Opt/lib:$LD_LIBRARY_PATH && ' \
                    'export PATH=/case/platforms/linux64GccDPInt32Opt/bin:$PATH && ' \
                    # Run the command
                    f'cd /case && echo "Running: {command}" && {command} || (echo "Command failed with exit code $?" && exit 1)'
                )
            ]
            
            print(f"🔧 Running command: {' '.join(cmd[:5])} [command hidden for security]")
            
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
                cwd=cwd or run_dir
            )
            
            # Read output in real-time
            for line in process.stdout:
                if line.strip():
                    socketio.emit('output', {
                        'data': line.rstrip('\n'),
                        'timestamp': time.time(),
                        'run_id': os.path.basename(run_dir)
                    })
            
            # Wait for process to complete
            return_code = process.wait()
            
            if step_name:
                status = 'completed' if return_code == 0 else 'failed'
                update_step_status(step_name, status)
                
                if return_code != 0 and step_name != 'checkMesh':  # checkMesh can have non-zero exit but continue
                    raise subprocess.CalledProcessError(return_code, cmd)
            
            return return_code == 0
        
        # Start a thread to run the simulation
        def run_simulation_thread():
            # Use the global current_process variable
            global current_process
            try:
                # Run blockMesh
                if not run_of_command('blockMesh', 'blockMesh'):
                    raise Exception("blockMesh failed")
                
                # Run checkMesh (continue even if it fails)
                try:
                    run_of_command('checkMesh', 'checkMesh')
                except:
                    pass  # Continue even if checkMesh fails
                
                # Run potentialFoam
                if not run_of_command('potentialFoam', 'potentialFoam'):
                    raise Exception("potentialFoam failed")
                
                # Run simpleFoam
                if not run_of_command('simpleFoam', 'simpleFoam'):
                    raise Exception("simpleFoam failed")
                
                # Run post-processing
                update_step_status('postProcessing', 'running')
                socketio.emit('output', {
                    'data': "\n📊 Running post-processing...\n",
                    'timestamp': time.time(),
                    'run_id': os.path.basename(run_dir)
                })
                
                # Run sample if sampleDict exists
                if os.path.exists(os.path.join(run_dir, 'system/sampleDict')):
                    run_of_command('sample -dict system/sampleDict')
                
                # Run postProcess for basic field data
                run_of_command('postProcess -func \'mag(U)\'')
                
                update_step_status('postProcessing', 'completed')
                
                socketio.emit('output', {
                    'data': "\n✅ Simulation completed successfully!\n",
                    'timestamp': time.time(),
                    'run_id': os.path.basename(run_dir)
                })
                
            except Exception as e:
                socketio.emit('error', {
                    'message': f"Simulation failed: {str(e)}",
                    'timestamp': time.time(),
                    'run_id': os.path.basename(run_dir)
                })
                app.logger.error(f"Simulation failed: {str(e)}", exc_info=True)
            finally:
                current_process = None
        
        # Create a thread to run the simulation
        import threading
        thread = threading.Thread(target=run_simulation_thread)
        thread.daemon = True
        
        try:
            # Start the simulation thread
            thread.start()
            
            # Create a response with simulation details
            response = {
                'status': 'started',
                'run_id': os.path.basename(run_dir),
                'message': f'Simulation started in directory: {run_dir}',
                'log_file': os.path.join(run_dir, 'simulation.log'),
                'start_time': time.strftime('%Y-%m-%d %H:%M:%S')
            }
            
            # Store simulation info for later reference
            if not hasattr(app, 'running_simulations'):
                app.running_simulations = {}
            app.running_simulations[os.path.basename(run_dir)] = {
                'thread': thread,
                'start_time': time.time(),
                'status': 'running',
                'log_file': response['log_file']
            }
            
            return jsonify(response)
            
        except Exception as e:
            error_msg = f"Failed to start simulation thread: {str(e)}"
            print(f"❌ {error_msg}")
            return jsonify({
                'status': 'error',
                'message': error_msg
            }), 500

@app.route('/api/stop_simulation', methods=['POST'])
def stop_simulation():
    global current_process
    
    if current_process is None or current_process.poll() is not None:
        return jsonify({'status': 'error', 'message': 'No simulation is currently running'}), 400
    
    try:
        # Terminate the process group
        os.killpg(os.getpgid(current_process.pid), 9)
        current_process = None
        return jsonify({'status': 'success', 'message': 'Simulation stopped'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/check_docker', methods=['GET'])
def check_docker():
    """Check if Docker is running and return its status."""
    try:
        client = docker.from_env()
        client.ping()
        return jsonify({
            'status': 'success',
            'running': True,
            'version': client.version()['Version']
        })
    except Exception as e:
        return jsonify({
            'status': 'success',  # Still success because we got a response
            'running': False,
            'error': str(e)
        })

@app.route('/api/check_disk_space', methods=['GET'])
def check_disk_space():
    """Check available disk space and return in GB."""
    try:
        # Get disk usage statistics for the root partition
        disk_usage = psutil.disk_usage('/')
        
        # Convert bytes to GB
        total_gb = disk_usage.total / (1024 ** 3)
        used_gb = disk_usage.used / (1024 ** 3)
        free_gb = disk_usage.free / (1024 ** 3)
        percent_used = disk_usage.percent
        
        return jsonify({
            'status': 'success',
            'total_gb': round(total_gb, 2),
            'used_gb': round(used_gb, 2),
            'free_gb': round(free_gb, 2),
            'available_gb': round(disk_usage.free / (1024 ** 3), 2),
            'percent_used': round(percent_used, 2)
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/simulation_status', methods=['GET'])
def simulation_status():
    global current_process
    
    if current_process is None:
        return jsonify({'status': 'not_running'})
    
    return_code = current_process.poll()
    if return_code is None:
        return jsonify({'status': 'running'})
    else:
        return jsonify({'status': 'completed', 'return_code': return_code})

def read_process_output(process, log_file, process_info):
    """Read process output and send it via WebSocket
    
    Args:
        process: The subprocess.Popen object
        log_file: Path to the log file
        process_info: Dictionary containing process information
    """
    log_f = None
    try:
        # Ensure log directory exists
        log_dir = os.path.dirname(log_file)
        if not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True, mode=0o755)
            
        # Open log file in append mode
        log_f = open(log_file, 'a', buffering=1)  # Line buffered
        
        # Function to handle output line
        def handle_output(line):
            if not line or not line.strip():
                return
                
            # Clean up the line
            line = line.rstrip('\n')
            
            # Log to file
            log_f.write(line + '\n')
            
            # Send to WebSocket
            socketio.emit('output', {
                'data': line,
                'timestamp': time.time(),
                'run_id': os.path.basename(process_info['run_dir'])
            })
            
            # Print to console for debugging
            print(f"[PROCESS OUTPUT] {line}")
        
        # Read output line by line
        for line in iter(process.stdout.readline, ''):
            handle_output(line)
        
        # Read any remaining output
        for line in process.stdout:
            handle_output(line)
            
        # Wait for process to complete
        return_code = process.wait()
        
        # Log process completion
        completion_msg = (
            "\n✅ Process completed successfully\n" if return_code == 0 
            else f"\n❌ Process failed with return code {return_code}\n"
        )
        
        handle_output(completion_msg)
        return return_code
        
    except Exception as e:
        error_msg = f"Error reading process output: {str(e)}"
        print(f"❌ {error_msg}", file=sys.stderr)
        
        try:
            socketio.emit('error', {
                'message': error_msg,
                'timestamp': time.time(),
                'run_id': os.path.basename(process_info.get('run_dir', 'unknown'))
            })
        except Exception as emit_error:
            print(f"❌ Failed to emit error: {str(emit_error)}", file=sys.stderr)
        
        if log_f:
            log_f.write(f"\n❌ {error_msg}\n")
        
        return 1
            
    finally:
        # Clean up when process is done
        if 'process' in locals() and process:
            process_info['end_time'] = time.time()
            process_info['exit_code'] = process.poll()
            
            # Log completion
            try:
                if log_f is None:  # If we never opened the file, try to open it now
                    log_f = open(log_file, 'a')
                
                # Write completion message
                log_f.write("\n" + "=" * 80 + "\n")
                log_f.write(f"Process completed with exit code: {process_info.get('exit_code', -1)}\n")
                
                # Write process timing information
                if 'start_time' in process_info and 'end_time' in process_info:
                    log_f.write(f"Start time: {time.ctime(process_info['start_time'])}\n")
                    log_f.write(f"End time: {time.ctime(process_info['end_time'])}\n")
                    duration = process_info['end_time'] - process_info['start_time']
                    log_f.write(f"Duration: {duration:.2f} seconds\n")
                
            except Exception as log_error:
                print(f"❌ Error writing to log file: {str(log_error)}", file=sys.stderr)
            
            finally:
                if 'log_f' in locals() and log_f is not None:
                    try:
                        log_f.flush()
                        os.fsync(log_f.fileno())
                        log_f.close()
                    except Exception as close_error:
                        print(f"❌ Error closing log file: {str(close_error)}", file=sys.stderr)
        
        # Calculate duration if we have both start and end times
        duration = 0
        if 'start_time' in process_info and 'end_time' in process_info:
            duration = process_info['end_time'] - process_info['start_time']
            
        # Notify clients
        try:
            socketio.emit('simulation_complete', {
                'run_id': os.path.basename(process_info['run_dir']),
                'exit_code': process_info.get('exit_code', -1),
                'duration': duration,
                'log_file': log_file
            })
        except Exception as e:
            app.logger.error(f"Failed to send simulation complete event: {str(e)}")

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

if __name__ == '__main__':
    # Create necessary directories
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static/css', exist_ok=True)
    os.makedirs('static/js', exist_ok=True)
    
    # Run the app
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
