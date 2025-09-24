import os
import sys
import time
import docker
import shutil
import subprocess
import tempfile
from typing import Optional, Union

def check_disk_space(min_space_gb: float = 5.0) -> bool:
    """Check if there's enough disk space for Docker image"""
    try:
        total, used, free = shutil.disk_usage(".")
        free_gb = free / (1024**3)
        print(f"📊 Disk space available: {free_gb:.2f} GB")
        
        if free_gb < min_space_gb:
            print(f"❌ Insufficient disk space. Need at least {min_space_gb} GB.")
            return False
        return True
    except Exception as e:
        print(f"⚠️  Could not check disk space: {e}")
        return True

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
        # Ensure the case directory exists and is accessible
        os.makedirs(case_dir, exist_ok=True, mode=0o755)
        
        # Run container with proper user permissions
        # We'll let the container handle its own file permissions
        container = client.containers.run(
            image,
            command=f"bash -c 'source {bashrc_path} && cd {container_case_path} && {command}'",
            volumes={os.path.abspath(case_dir): {"bind": container_case_path, "mode": "rw"}},
            environment={
                "FOAM_USER_RUN": "/tmp",
                "WM_PROJECT_DIR": "/usr/lib/openfoam/openfoam2412",
                "FOAM_SETTINGS": "-fileHandler uncollated",
                "FOAM_SIGFPE": "false"
            },
            detach=True,
            remove=False,
            tty=True,
            user="root",
            working_dir=container_case_path,
            mem_limit='4g',
            memswap_limit='4g',
            # Run as current user to avoid permission issues
            user=f"{os.getuid()}:{os.getgid()}"
        )
        
        # Stream output with better error handling
        try:
            for line in container.logs(stream=True, follow=True):
                print(line.decode('utf-8', errors='replace').strip(), end='\n')
            
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
        except:
            pass

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
    # Use a local directory in the user's home folder
    home_dir = os.path.expanduser('~')
    local_tutorial_dir = os.path.join(home_dir, '.local', 'share', 'foamchalak', 'tutorials', 'pitzDaily')
    
    # Create the directory if it doesn't exist
    os.makedirs(local_tutorial_dir, exist_ok=True, mode=0o755)
    
    # Check if tutorial files already exist in the local directory
    if os.path.exists(os.path.join(local_tutorial_dir, "system")) and \
       os.path.exists(os.path.join(local_tutorial_dir, "0")) and \
       os.path.exists(os.path.join(local_tutorial_dir, "constant")):
        print(f"✅ Using existing tutorial files in: {local_tutorial_dir}")
        return local_tutorial_dir
    
    print("Extracting tutorial files...")
    
    # Create a temporary directory with a fixed location for better permission handling
    temp_dir = os.path.join(os.path.expanduser('~'), '.local', 'share', 'foamchalak', 'temp_tutorial')
    os.makedirs(temp_dir, exist_ok=True, mode=0o755)
    
    try:
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
    """Create a new run directory with timestamp in the user's home directory"""
    home_dir = os.path.expanduser('~')
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    
    # Create runs directory in user's home folder
    runs_dir = os.path.join(home_dir, '.local', 'share', 'foamchalak', 'runs')
    os.makedirs(runs_dir, exist_ok=True, mode=0o755)
    
    # Create timestamped run directory
    run_dir = os.path.join(runs_dir, f"run_{timestamp}")
    os.makedirs(run_dir, exist_ok=True, mode=0o755)
    
    # Get the tutorial directory
    tutorial_dir = setup_tutorial_case()
    if not tutorial_dir:
        print("❌ Failed to set up tutorial files")
        return ""
    
    # Copy tutorial files to the run directory
    try:
        for item in os.listdir(tutorial_dir):
            src = os.path.join(tutorial_dir, item)
            dst = os.path.join(run_dir, item)
            if os.path.isdir(src):
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)
        
        # Set permissions on the copied files
        for root, dirs, files in os.walk(run_dir):
            for d in dirs:
                os.chmod(os.path.join(root, d), 0o755)
            for f in files:
                os.chmod(os.path.join(root, f), 0o644)
        
        print(f"✅ Created run directory: {run_dir}")
        return run_dir
        
    except Exception as e:
        print(f"❌ Error creating run directory: {e}")
        import traceback
        traceback.print_exc()
        return ""

def main():
    """Main function to run the OpenFOAM case"""
    try:
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
        
        # Run simpleFoam
        print("\n🚀 Running simpleFoam...")
        if not run_openfoam_command(image, "simpleFoam", case_dir, bashrc_path):
            print("❌ simpleFoam failed")
            return 1
        
        print("\n✅ Simulation completed successfully!")
        print(f"📂 Results are available in: {case_dir}")
        return 0
        
    except KeyboardInterrupt:
        print("\n🛑 Simulation was interrupted by user")
        return 130
    except Exception as e:
        print(f"\n❌ An unexpected error occurred: {e}")
        import traceback
        traceback.print_exc()
        return 1
        print(f"Check the output in: {case_dir}")

if __name__ == "__main__":
    main()
