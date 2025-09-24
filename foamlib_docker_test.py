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

def main():
    """Main function to run the OpenFOAM case"""
    # Set up case directory
    case_dir = os.path.join(os.getcwd(), "run_folder", "incompressible", "simpleFoam", "pitzDaily")
    os.makedirs(case_dir, exist_ok=True)
    
    # Extract tutorial if needed
    if not os.path.exists(os.path.join(case_dir, "system")) or not os.path.exists(os.path.join(case_dir, "0")):
        print("Extracting tutorial...")
        os.makedirs(case_dir, exist_ok=True)
        client = docker.from_env()
        try:
            # First, copy the tutorial files to a temporary directory
            container = client.containers.run(
                "haldardhruv/ubuntu_noble_openfoam:v2412",
                "bash -c 'mkdir -p /tmp/tutorial && cp -r /usr/lib/openfoam/openfoam2412/tutorials/incompressible/simpleFoam/pitzDaily/* /tmp/tutorial/ && ls -la /tmp/tutorial/'",
                detach=True,
                remove=False,
                tty=True,
                user="root"
            )
            
            # Wait for the container to finish
            container.wait()
            
            # Copy the files from the container to the host
            os.makedirs(case_dir, exist_ok=True)
            
            # Create a temporary container to copy files from
            container = client.containers.create(
                "haldardhruv/ubuntu_noble_openfoam:v2412",
                command=["sleep", "infinity"],
                volumes={
                    os.path.abspath(case_dir): {"bind": "/host_case", "mode": "rw"}
                },
                user="root"
            )
            container.start()
            
            # Copy the tutorial files to the host
            exit_code, output = container.exec_run(
                f"cp -r /usr/lib/openfoam/openfoam2412/tutorials/incompressible/simpleFoam/pitzDaily/. /host_case/",
                workdir="/",
                user="root"
            )
            
            if exit_code != 0:
                print(f"❌ Failed to copy tutorial files: {output.decode()}")
                return False
                
            print(f"✅ Extracted tutorial to: {case_dir}")
            
            # Clean up
            container.stop()
            container.remove()
            
        except Exception as e:
            print(f"❌ Failed to extract tutorial: {e}")
            return
    
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

if __name__ == "__main__":
    main()
