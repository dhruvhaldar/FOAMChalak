import os
import sys
import time
import docker
import shutil
import logging

# Set up logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('foamlib_docker_test.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)
import subprocess
import tempfile
import glob
from typing import Optional, Union, List

def check_disk_space(min_space_gb: float = 5.0) -> bool:
    """Check if there's enough disk space for Docker image"""
    try:
        total, used, free = shutil.disk_usage(".")
        free_gb = free / (1024**3)
        logger.info(f"📊 Disk space available: {free_gb:.2f} GB")
        if free_gb < min_space_gb:
            logger.error(f"❌ Not enough disk space. Required: {min_space_gb} GB, Available: {free_gb:.2f} GB")
            return False
        return True
    except Exception as e:
        logger.error(f"❌ Error checking disk space: {e}")
        return False

def get_docker_image_size(image_name: str) -> float:
    """Get the size of a Docker image in GB"""
    image_sizes = {
        "haldardhruv/ubuntu_noble_openfoam:v2412": 2.5,
        "openfoam/openfoam10-paraview56": 3.0,
        "openfoam/openfoam9": 2.0,
        "openfoam/openfoam8": 1.8,
    }
    return image_sizes.get(image_name, 3.0)

def pull_docker_image(image_name: str) -> bool:
    """Pull Docker image if not present locally"""
    estimated_size = get_docker_image_size(image_name)
    required_space = estimated_size * 1.5
    
    print(f"📦 Estimated image size: {estimated_size:.1f} GB")
    print(f"💾 Required space (with buffer): {required_space:.1f} GB")
    
    if not check_disk_space(required_space):
        print("❌ Not enough disk space")
        return False
    
    client = docker.from_env()
    try:
        client.images.get(image_name)
        print(f"✅ Image exists: {image_name}")
        return True
    except docker.errors.ImageNotFound:
        print(f"⏳ Pulling image: {image_name}")
        try:
            client.images.pull(image_name)
            print(f"✅ Pulled image: {image_name}")
            return True
        except Exception as e:
            print(f"❌ Failed to pull image: {e}")
            return False

def find_openfoam_bashrc(image_name: str) -> str:
    """Find OpenFOAM bashrc in Docker image"""
    client = docker.from_env()
    common_paths = [
        "/usr/lib/openfoam/openfoam2412/etc/bashrc",
        "/opt/openfoam2412/etc/bashrc",
        "/opt/OpenFOAM/OpenFOAM-v2412/etc/bashrc",
        "/usr/lib64/openfoam/openfoam2412/etc/bashrc",
    ]
    
    for path in common_paths:
        try:
            result = client.containers.run(
                image_name,
                f"bash -c '[ -f {path} ] && echo FOUND || echo NOT_FOUND'",
                remove=True,
                stdout=True,
                stderr=True
            )
            if b"FOUND" in result:
                print(f"✅ Found OpenFOAM bashrc at: {path}")
                return path
        except Exception as e:
            continue
    
    print("❌ Could not find OpenFOAM bashrc")
    return ""

def run_openfoam_command(
    image: str,
    command: str,
    case_dir: str,
    bashrc_path: str = ""
) -> bool:
    """Run an OpenFOAM command in a Docker container
    
    Args:
        image: Docker image to use
        command: OpenFOAM command to run
        case_dir: Case directory path
        bashrc_path: Path to OpenFOAM bashrc file
        
    Returns:
        bool: True if command succeeded, False otherwise
    """
    if not pull_docker_image(image):
        return False
    
    if not bashrc_path:
        bashrc_path = find_openfoam_bashrc(image)
        if not bashrc_path:
            return False
    
    client = docker.from_env()
    container_case_path = "/home/foam/case"
    
    try:
        # Ensure the case directory exists and is accessible with correct permissions
        os.makedirs(case_dir, exist_ok=True, mode=0o755)
        
        # Create a temporary directory for the container's home
        temp_home = os.path.join(os.path.dirname(case_dir), 'temp_home')
        os.makedirs(temp_home, exist_ok=True, mode=0o755)
        
        # Set environment variables
        env_vars = os.environ.copy()
        env_vars.update({
            "FOAM_USER_RUN": "/tmp",
            "WM_PROJECT_DIR": "/usr/lib/openfoam/openfoam2412",
            "FOAM_SETTINGS": "-fileHandler uncollated",
            "FOAM_SIGFPE": "false",
            "HOME": "/home/foam",
            "USER": "foam"
        })
        
        # Prepare the command to run in the container
        cmd = f"""
        set -e  # Exit on error
        
        # Create necessary directories and set permissions
        mkdir -p /home/foam
        chown -R {os.getuid()}:{os.getgid()} /home/foam {container_case_path}
        chmod -R 755 {container_case_path}
        
        # Source OpenFOAM environment
        source {bashrc_path}
        
        # Change to case directory and list contents for debugging
        cd {container_case_path}
        echo "Current directory: $(pwd)"
        echo "Contents of {container_case_path}:"
        ls -la .
        
        # Check if essential files exist
        echo "\nChecking for required files:"
        for f in system/controlDict system/blockMeshDict 0/U 0/p constant/polyMesh/blockMeshDict; do
            if [ -f "$f" ] || [ -d "$f" ]; then
                echo "✅ Found: $f"
            else
                echo "❌ Missing: $f"
            fi
        done
        
        # Run the actual command
        echo -e "\n🚀 Running: {command}"
        {command} || {{ 
            echo "\n❌ Command failed with status $?"
            exit 1 
        }}
        """
        
        # Set up container with proper permissions and environment
        container = client.containers.run(
            image,
            command=cmd,
            volumes={
                os.path.abspath(case_dir): {"bind": container_case_path, "mode": "rw"},
                temp_home: {"bind": "/home/foam", "mode": "rw"}
            },
            environment=env_vars,
            detach=True,
            remove=False,
            tty=True,
            working_dir=container_case_path,
            mem_limit='4g',
            memswap_limit='4g',
            user=f"{os.getuid()}:{os.getgid()}",
            entrypoint=["/bin/bash", "-c"]
        )
        
        # Stream output with better error handling
        try:
            # Get the logs as a single string
            logs = container.logs(stdout=True, stderr=True, stream=False, follow=True)
            # Decode and print complete lines
            for line in logs.decode('utf-8', errors='replace').splitlines():
                print(f"[14:02:14]{line}")
            
            result = container.wait()
            return result['StatusCode'] == 0
        except Exception as e:
            print(f"❌ Error reading container logs: {e}")
            return False
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    finally:
        try:
            if 'container' in locals():
                container.remove(force=True)
        except Exception as e:
            print(f"⚠️ Warning: Could not remove container: {e}")
        try:
            if 'temp_home' in locals() and os.path.exists(temp_home):
                shutil.rmtree(temp_home, ignore_errors=True)
        except Exception as e:
            print(f"⚠️ Warning: Could not remove temporary home directory: {e}")
        # Ensure case directory has correct permissions
        if os.path.exists(case_dir):
            try:
                os.chmod(case_dir, 0o755)
                for root, dirs, files in os.walk(case_dir):
                    for d in dirs:
                        os.chmod(os.path.join(root, d), 0o755)
                    for f in files:
                        os.chmod(os.path.join(root, f), 0o644)
            except Exception as e:
                print(f"⚠️ Warning: Could not set permissions for {case_dir}: {e}")

def get_tutorial_case_dir() -> str:
    """Get the path to the tutorial case directory"""
    return os.path.join(
        os.path.dirname(os.path.abspath(__file__)), 
        "tutorials",
        "incompressible",
        "simpleFoam",
        "pitzDaily"
    )

def setup_tutorial_case() -> str:
    """Set up the tutorial case files if they don't exist
    
    Returns:
        str: Path to the tutorial directory if successful, empty string otherwise
    """
    # Use a local directory in the application directory
    app_dir = os.path.dirname(os.path.abspath(__file__))
    local_tutorial_dir = os.path.join(app_dir, 'tutorials', 'pitzDaily')
    
    # Create the directory if it doesn't exist with proper permissions
    try:
        os.makedirs(local_tutorial_dir, exist_ok=True, mode=0o755)
        # Ensure the parent directory has the right permissions
        os.chmod(os.path.dirname(local_tutorial_dir), 0o755)
    except Exception as e:
        print(f"❌ Error creating tutorial directory: {e}")
        return ""
    
    # Check if tutorial files already exist in the local directory
    required_dirs = ["system", "0", "constant"]
    required_files = [
        os.path.join("system", "controlDict"),
        os.path.join("system", "blockMeshDict"),
        os.path.join("0", "U"),
        os.path.join("0", "p"),
        os.path.join("constant", "polyMesh", "blockMeshDict")
    ]
    
    # Check if all required files and directories exist and are accessible
    all_files_exist = all(
        os.path.exists(os.path.join(local_tutorial_dir, f)) 
        for f in required_files + required_dirs
    )
    
    if all_files_exist:
        print(f"✅ Using existing tutorial files in: {local_tutorial_dir}")
        return local_tutorial_dir
    
    print("Extracting tutorial files...")
    
    # Create a temporary directory with a random name to avoid conflicts
    import tempfile
    temp_dir = tempfile.mkdtemp(prefix='foamchalak_tmp_', dir=app_dir)
    try:
        os.chmod(temp_dir, 0o755)  # Ensure temp directory is accessible
        
        client = docker.from_env()
        
        # Clean up any existing files in temp directory
        for item in os.listdir(temp_dir):
            item_path = os.path.join(temp_dir, item)
            try:
                if os.path.isdir(item_path):
                    shutil.rmtree(item_path)
                else:
                    os.unlink(item_path)
            except Exception as e:
                print(f"⚠️ Warning: Could not remove {item_path}: {e}")
        
        # Run a container to extract the tutorial files
        container = client.containers.run(
            "haldardhruv/ubuntu_noble_openfoam:v2412",
            command=["bash", "-c", """
                mkdir -p /mnt/tutorial && 
                cp -r /usr/lib/openfoam/openfoam2412/tutorials/incompressible/simpleFoam/pitzDaily/. /mnt/tutorial/ && 
                chmod -R 755 /mnt/tutorial
            """],
            volumes={
                temp_dir: {"bind": "/mnt/tutorial", "mode": "rw"}
            },
            remove=True,
            user="root"
        )
        
        # Ensure local tutorial directory exists and is writable
        os.makedirs(local_tutorial_dir, exist_ok=True, mode=0o755)
        
        # Copy files from temp directory to local tutorial directory
        for item in os.listdir(temp_dir):
            src = os.path.join(temp_dir, item)
            dst = os.path.join(local_tutorial_dir, item)
            try:
                if os.path.isdir(src):
                    if os.path.exists(dst):
                        shutil.rmtree(dst)
                    shutil.copytree(src, dst)
                else:
                    shutil.copy2(src, dst)
            except Exception as e:
                print(f"⚠️ Warning: Could not copy {src} to {dst}: {e}")
        
        # Set permissions on the copied files
        for root, dirs, files in os.walk(local_tutorial_dir):
            for d in dirs:
                try:
                    os.chmod(os.path.join(root, d), 0o755)
                except Exception as e:
                    print(f"⚠️ Warning: Could not set permissions on directory {d}: {e}")
            for f in files:
                try:
                    os.chmod(os.path.join(root, f), 0o644)
                except Exception as e:
                    print(f"⚠️ Warning: Could not set permissions on file {f}: {e}")
        
        print(f"✅ Successfully extracted tutorial to: {local_tutorial_dir}")
        return local_tutorial_dir
        
    except Exception as e:
        print(f"❌ Failed to set up tutorial case: {e}")
        return ""
    finally:
        # Clean up the temporary directory
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception as e:
            print(f"⚠️ Warning: Could not remove temporary directory {temp_dir}: {e}")

def create_run_directory() -> str:
    """
    Create or use an existing run directory.
    If FOAMCHALAK_RUN_DIR is set in the environment, use that.
    Otherwise, create a new directory in the current working directory.
    """
    # Check if run directory is provided in environment
    run_dir = os.environ.get('FOAMCHALAK_RUN_DIR')
    if run_dir and os.path.isdir(run_dir):
        print(f"✅ Using existing run directory: {run_dir}")
        
        # Get tutorial directory
        tutorial_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tutorials', 'pitzDaily')
        
        # Copy all files from tutorial directory to run directory
        print(f"📂 Copying files from tutorial directory: {tutorial_dir}")
        try:
            # Create system and constant directories if they don't exist
            system_dir = os.path.join(run_dir, "system")
            constant_dir = os.path.join(run_dir, "constant")
            zero_dir = os.path.join(run_dir, "0")
            
            os.makedirs(system_dir, exist_ok=True, mode=0o755)
            os.makedirs(constant_dir, exist_ok=True, mode=0o755)
            os.makedirs(zero_dir, exist_ok=True, mode=0o755)
            
            # Copy system files
            if os.path.exists(os.path.join(tutorial_dir, "system")):
                for item in os.listdir(os.path.join(tutorial_dir, "system")):
                    src = os.path.join(tutorial_dir, "system", item)
                    dst = os.path.join(system_dir, item)
                    if os.path.isdir(src):
                        if os.path.exists(dst):
                            shutil.rmtree(dst)
                        shutil.copytree(src, dst)
                    else:
                        shutil.copy2(src, dst)
            
            # Copy constant files
            if os.path.exists(os.path.join(tutorial_dir, "constant")):
                for item in os.listdir(os.path.join(tutorial_dir, "constant")):
                    src = os.path.join(tutorial_dir, "constant", item)
                    dst = os.path.join(constant_dir, item)
                    if os.path.isdir(src):
                        if os.path.exists(dst):
                            shutil.rmtree(dst)
                        shutil.copytree(src, dst)
                    else:
                        shutil.copy2(src, dst)
            
            # Copy 0 directory files
            if os.path.exists(os.path.join(tutorial_dir, "0")):
                for item in os.listdir(os.path.join(tutorial_dir, "0")):
                    src = os.path.join(tutorial_dir, "0", item)
                    dst = os.path.join(zero_dir, item)
                    if os.path.isdir(src):
                        if os.path.exists(dst):
                            shutil.rmtree(dst)
                        shutil.copytree(src, dst)
                    else:
                        shutil.copy2(src, dst)
            
            # Verify essential files were copied
            print("🔍 Verifying essential files...")
            system_files = ["blockMeshDict", "controlDict", "fvSchemes", "fvSolution"]
            missing_files = []
            
            print("\n=== Verifying required files ===")
            for f in system_files:
                file_path = os.path.join(system_dir, f)
                exists = os.path.exists(file_path)
                print(f"{file_path}: {'✅' if exists else '❌'}")
                if not exists:
                    missing_files.append(file_path)
            
            if missing_files:
                print(f"\n❌ Error: Missing {len(missing_files)} required files:")
                for f in missing_files:
                    print(f"  - {f}")
                
                print("\n=== Directory Structure ===")
                print(f"Run directory: {run_dir}")
                print(f"System directory: {system_dir} (exists: {os.path.exists(system_dir)})")
                print(f"Constant directory: {constant_dir} (exists: {os.path.exists(constant_dir)})")
                
                if os.path.exists(system_dir):
                    print("\nSystem directory contents:")
                    for f in os.listdir(system_dir):
                        print(f"  - {f}")
                print("================================\n")
                
                # Clean up the incomplete run directory
                shutil.rmtree(run_dir, ignore_errors=True)
                return ""
                
            print("\n✅ All required files were copied successfully")
            
        except Exception as e:
            print(f"❌ Error copying tutorial files: {e}")
            import traceback
            traceback.print_exc()
            shutil.rmtree(run_dir, ignore_errors=True)
            return ""
            
        # Create the constant directory if it doesn't exist
        constant_dir = os.path.join(run_dir, "constant")
        print(f"\n=== Creating constant directory: {constant_dir} ===")
        try:
            # Remove existing directory if it exists
            if os.path.exists(constant_dir):
                print(f"Removing existing directory: {constant_dir}")
                shutil.rmtree(constant_dir, ignore_errors=True)
            
            # Create the directory with explicit permissions
            print(f"Creating directory: {constant_dir}")
            os.makedirs(constant_dir, mode=0o755)
            
            # Verify directory was created
            if not os.path.exists(constant_dir):
                raise Exception(f"Failed to create directory: {constant_dir}")
                
            # Set explicit permissions
            os.chmod(constant_dir, 0o755)
            
            # Verify permissions
            mode = oct(os.stat(constant_dir).st_mode)[-3:]
            print(f"Directory permissions set to: {mode}")
            
            # Verify we can create files in the directory
            test_file = os.path.join(constant_dir, "test_file.txt")
            try:
                with open(test_file, 'w') as f:
                    f.write("test")
                if os.path.exists(test_file):
                    os.remove(test_file)
                    print("✅ Verified write access to constant directory")
            except Exception as e:
                print(f"❌ Failed to write test file in {constant_dir}: {e}")
                shutil.rmtree(run_dir, ignore_errors=True)
                return ""
        except Exception as e:
            print(f"❌ Error creating constant directory: {e}")
            shutil.rmtree(run_dir, ignore_errors=True)
            return ""
            
        print("\n✅ All required files are present")
            
        # Create the polyMesh directory with proper permissions
        poly_mesh_dir = os.path.join(constant_dir, "polyMesh")
        print(f"\n=== Creating polyMesh directory: {poly_mesh_dir} ===")
        
        # Print current working directory and full path
        print(f"Current working directory: {os.getcwd()}")
        print(f"Full path to polyMesh_dir: {os.path.abspath(poly_mesh_dir)}")
        
        # Create the polyMesh directory if it doesn't exist
        if not os.path.exists(poly_mesh_dir):
            print(f"Creating polyMesh directory: {poly_mesh_dir}")
            try:
                os.makedirs(poly_mesh_dir, exist_ok=True)
                print(f"Successfully created polyMesh directory")
            except Exception as e:
                print(f"Failed to create polyMesh directory: {e}")
        else:
            print("polyMesh directory already exists")
        
        try:
            # Check parent directory first
            parent_dir = os.path.dirname(poly_mesh_dir)
            print(f"\n=== Parent Directory Info ===")
            print(f"Parent directory: {parent_dir}")
            print(f"Parent directory exists: {os.path.exists(parent_dir)}")
            
            if os.path.exists(parent_dir):
                # Get detailed info about the parent directory
                parent_stat = os.stat(parent_dir)
                print(f"Parent directory permissions: {oct(parent_stat.st_mode)[-3:]}")
                print(f"Parent directory owner: {parent_stat.st_uid}")
                print(f"Parent directory group: {parent_stat.st_gid}")
                print(f"Parent directory is directory: {os.path.isdir(parent_dir)}")
                print(f"Parent directory is writable: {os.access(parent_dir, os.W_OK)}")
                print(f"Parent directory contents: {os.listdir(parent_dir)}")
                
                # Try to create a test file in the parent directory
                test_file = os.path.join(parent_dir, "test_file.txt")
                print(f"\n=== Testing file creation in parent directory ===")
                print(f"Attempting to create test file: {test_file}")
                
                try:
                    with open(test_file, 'w') as f:
                        f.write("test")
                    print(f"Successfully created test file: {test_file}")
                    
                    if os.path.exists(test_file):
                        file_stat = os.stat(test_file)
                        print(f"Test file exists. Permissions: {oct(file_stat.st_mode)[-3:]}")
                        print(f"Test file owner: {file_stat.st_uid}")
                        print(f"Test file group: {file_stat.st_gid}")
                        
                        # Try to remove the test file
                        try:
                            os.remove(test_file)
                            print("Successfully removed test file")
                        except Exception as e:
                            print(f"Failed to remove test file: {e}")
                    else:
                        print("Test file was not created")
                        
                except Exception as e:
                    print(f"Failed to create test file: {e}")
                    print(f"Error type: {type(e).__name__}")
                    print(f"Error details: {str(e)}")
            else:
                print("Parent directory does not exist")
            
            # Print detailed info about parent directory
            if os.path.exists(parent_dir):
                print(f"Parent directory permissions: {oct(os.stat(parent_dir).st_mode)[-3:]}")
                print(f"Parent directory is directory: {os.path.isdir(parent_dir)}")
                print(f"Parent directory is writable: {os.access(parent_dir, os.W_OK)}")
                print(f"Parent directory contents: {os.listdir(parent_dir)}")
                
                # Try to create a test file in the parent directory
                test_file = os.path.join(parent_dir, "test_file.txt")
                try:
                    with open(test_file, 'w') as f:
                        f.write("test")
                    print(f"Successfully created test file: {test_file}")
                    if os.path.exists(test_file):
                        print(f"Test file permissions: {oct(os.stat(test_file).st_mode)[-3:]}")
                        os.remove(test_file)
                        print("Removed test file")
                except Exception as e:
                    print(f"Failed to create test file: {e}")
            if os.path.exists(parent_dir):
                print(f"Parent directory permissions: {oct(os.stat(parent_dir).st_mode)[-3:]}")
                print(f"Parent directory is writable: {os.access(parent_dir, os.W_OK)}")
                print(f"Parent directory contents: {os.listdir(parent_dir) if os.path.exists(parent_dir) else 'Does not exist'}")
                
                # Try to create a test directory
                test_dir = os.path.join(parent_dir, "test_dir")
                print(f"\n=== Testing directory creation in parent ===")
                print(f"Attempting to create test directory: {test_dir}")
                try:
                    os.makedirs(test_dir, exist_ok=True)
                    print(f"Test directory created: {os.path.exists(test_dir)}")
                    if os.path.exists(test_dir):
                        print(f"Test directory permissions: {oct(os.stat(test_dir).st_mode)[-3:]}")
                        print("Removing test directory...")
                        shutil.rmtree(test_dir)
                        print(f"Test directory removed: {not os.path.exists(test_dir)}")
                    else:
                        print("Test directory was not created")
                except Exception as e:
                    print(f"Error creating test directory: {e}")
            
            # Remove existing directory if it exists
            if os.path.exists(poly_mesh_dir):
                print(f"Removing existing directory: {poly_mesh_dir}")
                shutil.rmtree(poly_mesh_dir, ignore_errors=True)
            
            # Create the directory with explicit permissions
            print(f"Creating directory: {poly_mesh_dir}")
            try:
                os.makedirs(poly_mesh_dir, mode=0o755, exist_ok=True)
            except Exception as e:
                print(f"Error in os.makedirs: {e}")
                raise
            
            # Verify directory was created
            if not os.path.exists(poly_mesh_dir):
                print("Directory was not created. Listing parent directory contents:")
                print(os.listdir(parent_dir))
                raise Exception(f"Failed to create directory: {poly_mesh_dir}")
                
            # Set explicit permissions
            try:
                os.chmod(poly_mesh_dir, 0o755)
            except Exception as e:
                print(f"Error in os.chmod: {e}")
                raise
            
            # Verify permissions
            try:
                mode = oct(os.stat(poly_mesh_dir).st_mode)[-3:]
                print(f"Directory created with permissions: {mode}")
                print(f"Directory is writable: {os.access(poly_mesh_dir, os.W_OK)}")
            except Exception as e:
                print(f"Error checking directory permissions: {e}")
            
            # Test write access
            test_file = os.path.join(poly_mesh_dir, ".test_write")
            print(f"Testing write access to: {test_file}")
            try:
                with open(test_file, 'w') as f:
                    f.write("test")
                if not os.path.exists(test_file):
                    raise Exception("Test file was not created")
                print(f"Test file created successfully")
                os.remove(test_file)
                print("✅ Verified polyMesh directory is writable")
            except Exception as e:
                print(f"❌ Error testing write access: {e}")
                raise
                
        except Exception as e:
            print(f"❌ Error creating {poly_mesh_dir}: {e}")
            print(f"Current working directory: {os.getcwd()}")
            print(f"Directory exists: {os.path.exists(poly_mesh_dir)}")
            if os.path.exists(poly_mesh_dir):
                print(f"Directory permissions: {oct(os.stat(poly_mesh_dir).st_mode)[-3:]}")
            print(f"Parent directory contents: {os.listdir(parent_dir) if os.path.exists(parent_dir) else 'Does not exist'}")
            shutil.rmtree(run_dir, ignore_errors=True)
            return ""
        
        # Check if blockMeshDict exists in constant/polyMesh, if not, create it
        block_mesh_dict = os.path.join(poly_mesh_dir, "blockMeshDict")
        print(f"\n=== Checking for blockMeshDict ===")
        print(f"Target path: {block_mesh_dict}")
        print(f"polyMesh directory exists: {os.path.exists(poly_mesh_dir)}")
        if os.path.exists(poly_mesh_dir):
            print(f"polyMesh permissions: {oct(os.stat(poly_mesh_dir).st_mode)[-3:]}")
        
        if not os.path.exists(block_mesh_dict):
            print("\n🔧 Creating blockMeshDict in constant/polyMesh...")
            try:
                # Verify the directory is writable
                test_file = os.path.join(poly_mesh_dir, ".test_write")
                print(f"\n=== Testing write access ===")
                print(f"Test file path: {test_file}")
                try:
                    print("Attempting to write test file...")
                    with open(test_file, 'w') as f:
                        f.write("test")
                    print(f"Test file created: {os.path.exists(test_file)}")
                    if os.path.exists(test_file):
                        print(f"Test file permissions: {oct(os.stat(test_file).st_mode)[-3:]}")
                        print("Removing test file...")
                        os.remove(test_file)
                        print(f"Test file removed: {not os.path.exists(test_file)}")
                    else:
                        print("Test file was not created")
                except Exception as e:
                    print(f"❌ Error writing test file: {e}")
                    print(f"Current working directory: {os.getcwd()}")
                    print(f"Parent directory: {os.path.dirname(poly_mesh_dir)}")
                    print(f"Parent directory exists: {os.path.exists(os.path.dirname(poly_mesh_dir))}")
                    if os.path.exists(os.path.dirname(poly_mesh_dir)):
                        print(f"Parent directory permissions: {oct(os.stat(os.path.dirname(poly_mesh_dir)).st_mode)[-3:]}")
                    shutil.rmtree(run_dir, ignore_errors=True)
                    return ""
                
                print("\n=== Creating blockMeshDict ===")
                print(f"Target file: {block_mesh_dict}")
                
                # Verify parent directory exists and is writable
                parent_dir = os.path.dirname(block_mesh_dict)
                print(f"Parent directory: {parent_dir}")
                print(f"Parent directory exists: {os.path.exists(parent_dir)}")
                if os.path.exists(parent_dir):
                    print(f"Parent directory permissions: {oct(os.stat(parent_dir).st_mode)[-3:]}")
                
                # Create a simple blockMeshDict
                block_mesh_content = """/*--------------------------------*- C++ -*----------------------------------*\\
  =========                 |
  \\      /  F ield         | OpenFOAM: The Open Source CFD Toolbox
   \\    /   O peration     | Website:  https://openfoam.org
    \\  /    A nd           | Version:  10
     \\/     M anipulation  |
\\*---------------------------------------------------------------------------*/
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      blockMeshDict;
}
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

convertToMeters 1.0;

vertices
(
    (0 0 0)
    (1 0 0)
    (1 1 0)
    (0 1 0)
    (0 0 0.1)
    (1 0 0.1)
    (1 1 0.1)
    (0 1 0.1)
);

blocks
(
    hex (0 1 2 3 4 5 6 7) (20 20 1) simpleGrading (1 1 1)
);

edges
(
);

boundary
(
    front
    {
        type patch;
        faces
        (
            (3 7 6 2)
            (2 6 5 1)
            (1 5 4 0)
            (0 4 7 3)
        );
    }
    back
    {
        type patch;
        faces
        (
            (4 5 6 7)
        );
    }
    defaultFaces
    {
        type empty;
        faces
        (
            (0 3 2 1)
        );
    }
);

mergePatchPairs
(
);

// ************************************************************************* //"""
                
                with open(block_mesh_dict, 'w') as f:
                    f.write(block_mesh_content)
                print(f"✅ Created {block_mesh_dict}")
                
            except Exception as e:
                print(f"❌ Error creating blockMeshDict: {e}")
                shutil.rmtree(run_dir, ignore_errors=True)
                return ""
                
        return run_dir
    
    # Create a new run directory in the current working directory
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    base_runs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'runs')
    run_dir = os.path.join(base_runs_dir, f'run_{timestamp}')
    
    # Clean up any existing incomplete run directories
    if os.path.exists(run_dir):
        try:
            shutil.rmtree(run_dir)
        except Exception as e:
            print(f"⚠️  Warning: Could not clean up existing run directory: {e}")
    
    # Create the base runs directory if it doesn't exist
    os.makedirs(base_runs_dir, exist_ok=True, mode=0o755)
    
    # Create the run directory
    os.makedirs(run_dir, exist_ok=True, mode=0o755)
    
    # Get the tutorial directory
    tutorial_dir = setup_tutorial_case()
    if not tutorial_dir:
        print("❌ Failed to set up tutorial files")
        return ""
    
    # Copy tutorial files to the run directory
    try:
        print(f"📂 Copying tutorial files from {tutorial_dir} to {run_dir}")
        
        # First, copy all files and directories
        for item in os.listdir(tutorial_dir):
            src = os.path.join(tutorial_dir, item)
            dst = os.path.join(run_dir, item)
            
            # Skip special directories that will be handled separately
            if item in ['system', '0', 'constant']:
                continue
                
            if os.path.isdir(src):
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)
        
        # Copy system directory
        system_src = os.path.join(tutorial_dir, 'system')
        system_dst = os.path.join(run_dir, 'system')
        if os.path.exists(system_src):
            os.makedirs(system_dst, exist_ok=True, mode=0o755)
            for item in os.listdir(system_src):
                src = os.path.join(system_src, item)
                dst = os.path.join(system_dst, item)
                if os.path.isfile(src):
                    shutil.copy2(src, dst)
                elif os.path.isdir(src):
                    shutil.copytree(src, dst, dirs_exist_ok=True)
        
        # Copy 0 directory (initial conditions)
        zero_src = os.path.join(tutorial_dir, '0')
        zero_dst = os.path.join(run_dir, '0')
        if os.path.exists(zero_src):
            os.makedirs(zero_dst, exist_ok=True, mode=0o755)
            for item in os.listdir(zero_src):
                src = os.path.join(zero_src, item)
                dst = os.path.join(zero_dst, item)
                if os.path.isfile(src):
                    shutil.copy2(src, dst)
                elif os.path.isdir(src):
                    shutil.copytree(src, dst, dirs_exist_ok=True)
        
        # Copy constant directory
        constant_src = os.path.join(tutorial_dir, 'constant')
        constant_dst = os.path.join(run_dir, 'constant')
        if os.path.exists(constant_src):
            os.makedirs(constant_dst, exist_ok=True, mode=0o755)
            for item in os.listdir(constant_src):
                src = os.path.join(constant_src, item)
                dst = os.path.join(constant_dst, item)
                if os.path.isfile(src):
                    shutil.copy2(src, dst)
                elif os.path.isdir(src):
                    shutil.copytree(src, dst, dirs_exist_ok=True)
        
        # Set permissions on the copied files
        print("🔒 Setting file permissions...")
        for root, dirs, files in os.walk(run_dir):
            for d in dirs:
                os.chmod(os.path.join(root, d), 0o755)
            for f in files:
                os.chmod(os.path.join(root, f), 0o644)
        
        # Verify essential files were copied
        required_files = [
            'system/controlDict',
            'system/blockMeshDict',  # blockMeshDict is in the system directory
            '0',
            'constant'  # We only need the constant directory, not blockMeshDict inside it
        ]
        
        # Check which required files are missing
        missing_files = [f for f in required_files if not os.path.exists(os.path.join(run_dir, f))]
        
        # Print debug information about the required files
        print("\n=== Verifying required files ===")
        for f in required_files:
            exists = os.path.exists(os.path.join(run_dir, f))
            print(f"{f}: {'✅' if exists else '❌'}")
        
        if missing_files:
            print(f"❌ Error: Missing required files after copy: {', '.join(missing_files)}")
            return ""
        
        print(f"✅ Successfully created run directory: {run_dir}")
        return run_dir
        
    except Exception as e:
        print(f"❌ Error creating run directory: {e}")
        import traceback
        traceback.print_exc()
        # Clean up partially created directory
        try:
            shutil.rmtree(run_dir, ignore_errors=True)
        except:
            pass
        return ""

def cleanup_temp_folders(prefix: str = "foamchalak_tmp") -> List[str]:
    """
    Clean up temporary folders with the given prefix.
    
    Args:
        prefix: Prefix of the temporary folders to clean up
        
    Returns:
        List of paths that were deleted
    """
    deleted = []
    for temp_dir in glob.glob(f"./{prefix}*"):
        if os.path.isdir(temp_dir):
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
                deleted.append(temp_dir)
                logger.info(f"🧹 Deleted temporary directory: {temp_dir}")
            except Exception as e:
                logger.error(f"❌ Failed to delete {temp_dir}: {e}")
    return deleted


def main():
    """Main function to run the OpenFOAM case"""
    try:
        print("🚀 Starting OpenFOAM simulation...")
        
        # Clean up any previous temporary folders
        print("🧹 Cleaning up temporary directories...")
        deleted_dirs = cleanup_temp_folders()
        if deleted_dirs:
            print(f"✅ Cleaned up {len(deleted_dirs)} temporary directories")
        
        # Check disk space
        if not check_disk_space():
            return 1
        
        # Set up tutorial files if they don't exist
        tutorial_dir = setup_tutorial_case()
        if not tutorial_dir:
            print("❌ Failed to set up tutorial case")
            return 1
        
        print(f"📂 Using tutorial directory: {tutorial_dir}")
        
        # Create a new run directory with timestamp
        case_dir = create_run_directory()
        if not case_dir:
            print("❌ Failed to create run directory")
            return 1
        
        print(f"📂 Using case directory: {case_dir}")
        
        # Check Docker and pull image if needed
        image = "haldardhruv/ubuntu_noble_openfoam:v2412"
        print(f"🐳 Checking Docker image: {image}")
        if not pull_docker_image(image):
            print("❌ Failed to pull Docker image")
            return 1
        
        # Find OpenFOAM bashrc
        print("🔍 Locating OpenFOAM environment...")
        bashrc_path = find_openfoam_bashrc(image)
        if not bashrc_path:
            print("❌ Could not find OpenFOAM bashrc")
            return 1
        
        print(f"✅ Found OpenFOAM environment at: {bashrc_path}")
        
        # Run blockMesh
        print("\n🚀 Running blockMesh...")
        if not run_openfoam_command(image, "blockMesh", case_dir, bashrc_path):
            print("❌ blockMesh failed")
            return 1
        
        # Run checkMesh to verify the mesh
        print("\n🔍 Running checkMesh...")
        if not run_openfoam_command(image, "checkMesh", case_dir, bashrc_path):
            print("⚠️  checkMesh reported issues with the mesh")
            # Continue execution even if checkMesh reports issues
        
        # Run potentialFoam to initialize the flow field
        print("\n🌊 Running potentialFoam for initial flow field...")
        if not run_openfoam_command(image, "potentialFoam", case_dir, bashrc_path):
            print("❌ potentialFoam failed")
            return 1
        
        # Run simpleFoam for the main simulation
        print("\n🚀 Running simpleFoam...")
        if not run_openfoam_command(image, "simpleFoam", case_dir, bashrc_path):
            print("❌ simpleFoam failed")
            return 1
        
        # Run post-processing tools
        print("\n📊 Running post-processing...")
        
        # Run sample to extract data
        print("  - Running sample...")
        if os.path.exists(os.path.join(case_dir, "system/sampleDict")):
            if not run_openfoam_command(image, "sample -dict system/sampleDict", case_dir, bashrc_path):
                print("⚠️  sample failed, but continuing...")
        
        # Run postProcess for basic field data
        print("  - Running postProcess for field data...")
        if not run_openfoam_command(image, "postProcess -func 'mag(U)'", case_dir, bashrc_path):
            print("⚠️  postProcess failed, but continuing...")
        
        print("\n✅ Simulation completed successfully!")
        print(f"📂 Results are available in: {case_dir}")
        print("\n💡 You can visualize the results using ParaView or other OpenFOAM post-processing tools.")
        print(f"   The case directory contains all the simulation data: {case_dir}")
        return 0

    except KeyboardInterrupt:
        print("\n🛑 Simulation was interrupted by user")
        return 130
    except Exception as e:
        print(f"\n❌ An unexpected error occurred: {e}")
        import traceback
        traceback.print_exc()
        if 'case_dir' in locals():
            print(f"Check the output in: {case_dir}")
        return 1

if __name__ == "__main__":
    main()
