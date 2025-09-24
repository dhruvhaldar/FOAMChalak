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
    
    try:
        # Get the path to the Python interpreter in the virtual environment
        python_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'venv', 'bin', 'python')
        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'foamlib_docker_test.py')
        
        # Create a base directory for runs if it doesn't exist
        base_runs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'runs')
        os.makedirs(base_runs_dir, exist_ok=True, mode=0o755)
        
        # Create a timestamped run directory
        timestamp = time.strftime('%Y%m%d_%H%M%S')
        run_dir = os.path.join(base_runs_dir, f'run_{timestamp}')
        os.makedirs(run_dir, exist_ok=True, mode=0o755)
        
        # Set environment variables
        env = os.environ.copy()
        env['PYTHONUNBUFFERED'] = '1'  # Ensure output is not buffered
        env['FOAMCHALAK_RUN_DIR'] = run_dir
        
        # Log the start of the simulation
        log_file = os.path.join(run_dir, 'simulation.log')
        with open(log_file, 'w') as f:
            f.write(f"Starting simulation at {time.ctime()}\n")
            f.write(f"Command: {python_path} {script_path}\n")
            f.write("=" * 80 + "\n\n")
        
        current_process = subprocess.Popen(
            [python_path, script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True,
            env=env,
            cwd=run_dir
        )
        
        # Store process information
        process_info = {
            'start_time': time.time(),
            'run_dir': run_dir,
            'log_file': log_file
        }
        
        # Start a thread to read the output
        threading.Thread(
            target=read_process_output, 
            args=(current_process, log_file, process_info),
            daemon=True
        ).start()
        
        return jsonify({
            'status': 'success', 
            'message': 'Simulation started',
            'run_id': os.path.basename(run_dir),
            'run_dir': run_dir
        })
        
    except Exception as e:
        error_msg = f"Failed to start simulation: {str(e)}"
        app.logger.error(error_msg, exc_info=True)
        return jsonify({'status': 'error', 'message': error_msg}), 500

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
    try:
        with open(log_file, 'a') as log_f:
            for line in process.stdout:
                # Clean up the line
                line = line.rstrip('\r\n')
                if not line:
                    continue
                    
                # Log to file
                log_f.write(f"{line}\n")
                log_f.flush()
                
                # Send to WebSocket
                socketio.emit('output', {
                    'data': line,
                    'timestamp': time.time(),
                    'run_id': os.path.basename(process_info['run_dir'])
                })
                
                # Small delay to prevent flooding the client
                time.sleep(0.01)
                
    except Exception as e:
        error_msg = f"Error reading process output: {str(e)}"
        app.logger.error(error_msg, exc_info=True)
        socketio.emit('error', {'message': error_msg})
    finally:
        # Clean up when process is done
        process_info['end_time'] = time.time()
        process_info['exit_code'] = process.poll()
        
        # Log completion
        with open(log_file, 'a') as log_f:
            log_f.write("\n" + "=" * 80 + "\n")
            log_f.write(f"Process completed with exit code: {process_info['exit_code']}\n")
            log_f.write(f"Start time: {time.ctime(process_info['start_time'])}\n")
            log_f.write(f"End time: {time.ctime(process_info['end_time'])}\n")
            duration = process_info['end_time'] - process_info['start_time']
            log_f.write(f"Duration: {duration:.2f} seconds\n")
        
        # Notify clients
        socketio.emit('simulation_complete', {
            'run_id': os.path.basename(process_info['run_dir']),
            'exit_code': process_info['exit_code'],
            'duration': duration,
            'log_file': log_file
        })

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
