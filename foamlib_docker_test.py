import os
import sys
import time
import docker
import shutil
import subprocess

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
    """Run OpenFOAM command in Docker container"""
    if not pull_docker_image(image):
        return False
    
    if not bashrc_path:
        bashrc_path = find_openfoam_bashrc(image)
        if not bashrc_path:
            return False
    
    client = docker.from_env()
    container_case_path = "/home/foam/case"
    
    try:
        # Fix permissions
        subprocess.run(['sudo', 'chmod', '-R', '777', case_dir], check=True)
        uid = os.getuid()
        gid = os.getgid()
        subprocess.run(['sudo', 'chown', '-R', f'{uid}:{gid}', case_dir], check=True)
        
        # Run container
        container = client.containers.run(
            image,
            command=f"bash -c 'source {bashrc_path} && cd {container_case_path} && {command}'",
            volumes={os.path.abspath(case_dir): {"bind": container_case_path, "mode": "rw"}},
            environment={
                "FOAM_USER_RUN": "/tmp",
                "WM_PROJECT_DIR": "/usr/lib/openfoam/openfoam2412"
            },
            detach=True,
            remove=False,
            tty=True,
            user="root",
            working_dir=container_case_path,
            mem_limit='4g',
            memswap_limit='4g'
        )
        
        # Stream output
        for line in container.logs(stream=True, follow=True):
            print(line.decode().strip(), end='')
        
        result = container.wait()
        return result['StatusCode'] == 0
        
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

def setup_tutorial_case() -> bool:
    """Set up the tutorial case files if they don't exist"""
    tutorial_dir = get_tutorial_case_dir()
    
    # Check if tutorial files already exist
    if os.path.exists(os.path.join(tutorial_dir, "system")) and \
       os.path.exists(os.path.join(tutorial_dir, "0")) and \
       os.path.exists(os.path.join(tutorial_dir, "constant")):
        print(f"✅ Using existing tutorial files in: {tutorial_dir}")
        return True
    
    print("Extracting tutorial files...")
    # Create all parent directories first
    os.makedirs(tutorial_dir, exist_ok=True, mode=0o755)
    
    client = docker.from_env()
    
    try:
        # Run a container with the tutorial directory mounted
        container = client.containers.run(
            "haldardhruv/ubuntu_noble_openfoam:v2412",
            command=["bash", "-c", """
                mkdir -p /mnt/tutorial && 
                cp -r /usr/lib/openfoam/openfoam2412/tutorials/incompressible/simpleFoam/pitzDaily/. /mnt/tutorial/ && 
                chmod -R 755 /mnt/tutorial
            """],
            volumes={
                tutorial_dir: {"bind": "/mnt/tutorial", "mode": "rw"}
            },
            remove=True,
            user="root"
        )
        
        # Verify the files were copied
        if os.path.exists(os.path.join(tutorial_dir, "system")) and \
           os.path.exists(os.path.join(tutorial_dir, "0")) and \
           os.path.exists(os.path.join(tutorial_dir, "constant")):
            print(f"✅ Successfully extracted tutorial to: {tutorial_dir}")
            return True
        else:
            print("❌ Failed to verify tutorial files were copied")
            return False
            
    except Exception as e:
        print(f"❌ Failed to extract tutorial: {e}")
        import traceback
        traceback.print_exc()
        return False

def create_run_directory() -> str:
    """Create a new run directory with timestamp"""
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    run_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "runs",
        f"run_{timestamp}"
    )
    
    # Copy tutorial files to the new run directory
    tutorial_dir = get_tutorial_case_dir()
    shutil.copytree(tutorial_dir, run_dir, dirs_exist_ok=True)
    
    print(f"✅ Created run directory: {run_dir}")
    return run_dir

def main():
    """Main function to run the OpenFOAM case"""
    # Set up tutorial files if they don't exist
    if not setup_tutorial_case():
        print("❌ Failed to set up tutorial case")
        return
    
    # Create a new run directory with timestamp
    case_dir = create_run_directory()
    
    try:
        # Run blockMesh
        print("\n🔄 Running blockMesh...")
        if not run_openfoam_command(
            image="haldardhruv/ubuntu_noble_openfoam:v2412",
            command="blockMesh",
            case_dir=case_dir,
            bashrc_path="/usr/lib/openfoam/openfoam2412/etc/bashrc"
        ):
            print("❌ blockMesh failed")
            return
        
        # Run simpleFoam
        print("\n🔄 Running simpleFoam...")
        if not run_openfoam_command(
            image="haldardhruv/ubuntu_noble_openfoam:v2412",
            command="simpleFoam",
            case_dir=case_dir,
            bashrc_path="/usr/lib/openfoam/openfoam2412/etc/bashrc"
        ):
            print("❌ simpleFoam failed")
            return
        
        print("\n✅ OpenFOAM simulation completed successfully!")
        print(f"Results in: {case_dir}")
        
    except KeyboardInterrupt:
        print("\n⚠️  Simulation interrupted by user")
        print(f"Partial results are available in: {case_dir}")
    except Exception as e:
        print(f"\n❌ An error occurred: {e}")
        print(f"Check the output in: {case_dir}")

if __name__ == "__main__":
    main()
