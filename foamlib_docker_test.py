import os
from pathlib import Path
import docker
import sys
import time
import shutil
import subprocess
from foamlib import FoamCase
import docker

def run_case_in_docker(case_path: str):
    """Run the OpenFOAM case using Docker"""
    client = docker.from_env()
    
    # Try different possible OpenFOAM installation paths
    possible_bashrc_paths = [
        f"/opt/openfoam{openfoam_version}/etc/bashrc",
        f"/usr/lib/openfoam/openfoam{openfoam_version}/etc/bashrc",
        f"/home/foam/OpenFOAM/OpenFOAM-{openfoam_version}/etc/bashrc",
        f"/opt/openfoam/etc/bashrc",
        f"/usr/lib/openfoam/etc/bashrc",
        "/opt/OpenFOAM/OpenFOAM-v2012/etc/bashrc"
    ]
    
    # Test each path individually to find the first valid one
    for path in possible_bashrc_paths:
        try:
            print(f"🔍 Testing path: {path}")
            result = client.containers.run(
                image_name,
                f"bash -c '[ -f {path} ] && echo FOUND || echo NOT_FOUND'",
                remove=True,
                stdout=True,
                stderr=True
            )
            output = result.decode().strip()
            if "FOUND" in output:
                print(f"✅ Found OpenFOAM bashrc at: {path}")
                return path
            else:
                print(f"❌ Path not found: {path}")
        except Exception as e:
            print(f"⚠️  Error testing path {path}: {e}")
    
    # If none of the predefined paths work, search the filesystem
    print("🔍 Searching filesystem for OpenFOAM bashrc...")
    try:
        result = client.containers.run(
            image_name,
            "bash -c 'find / -name \"bashrc\" -path \"*/etc/bashrc\" 2>/dev/null | head -5'",
            remove=True,
            stdout=True,
            stderr=True
        )
        found_paths = result.decode().strip().split('\n')
        for path in found_paths:
            if path.strip():
                print(f"✅ Found potential bashrc at: {path}")
                return path.strip()
    except Exception as e:
        print(f"❌ Error searching for bashrc: {e}")
    
    # Last resort: check if OpenFOAM tools are available directly
    print("🔍 Checking if OpenFOAM tools are available directly...")
    try:
        result = client.containers.run(
            image_name,
            "bash -c 'which simpleFoam || which blockMesh || echo NO_OPENFOAM'",
            remove=True,
            stdout=True,
            stderr=True
        )
        foam_output = result.decode().strip()
        if foam_output != "NO_OPENFOAM":
            print(f"✅ OpenFOAM tools found directly: {foam_output}")
            # Return empty string to indicate direct tool usage
            return ""
    except Exception as e:
        print(f"❌ Error checking for OpenFOAM tools: {e}")
    
    return None

def run_openfoam_in_docker(
    image: str = "haldardhruv/ubuntu_noble_openfoam:v2412",
    solver: str = "foamRun -solver incompressibleFluid",
    case_dir: str = None,
    openfoam_version: str = "2412",
    bashrc_path: str = None
):
    """
    Run an OpenFOAM solver in a Docker container.
    
    Args:
        image: Docker image to use
        solver: Solver command to run
        case_dir: Local directory containing the case files
        openfoam_version: Version of OpenFOAM (e.g., "2412")
        bashrc_path: Path to the OpenFOAM bashrc file in the container
    
    Returns:
        bool: True if the solver ran successfully, False otherwise
    """
    # Set up Docker client
    client = docker.from_env()

    # Set up paths and environment
    container_case_path = "/home/foam/case"  # Using a simpler path in the container
    max_wait_time = 3600  # Maximum time to wait for container to complete (1 hour)

    # Check if the image exists locally, pull if not
    if not pull_docker_image(image):
        return False

    # Debug the Docker image to find OpenFOAM installation
    debug_docker_image(image)

    # Find the OpenFOAM bashrc file
    if bashrc_path is None:
        bashrc_path = find_openfoam_bashrc(image, openfoam_version)
    
    if bashrc_path is None:
        print("❌ Could not find OpenFOAM bashrc file")
        return False
    else:
        print(f"✅ Using OpenFOAM bashrc at: {bashrc_path}")

    # Prepare the command to run in the container
    # We'll use a temporary directory in the container to avoid permission issues
    command = [
        '/bin/bash', '-c',
        f'set -x && \
        source {bashrc_path} && \
        echo "=== Debug: Contents of {container_case_path} ===" && \
        ls -la {container_case_path} || true && \
        echo "=== Debug: Contents of {container_case_path}/system ===" && \
        ls -la {container_case_path}/system || true && \
        mkdir -p /tmp/case && \
        if [ -d "{container_case_path}" ] && [ "$(ls -A {container_case_path})" ]; then \
            cp -r {container_case_path}/* /tmp/case/; \
        fi && \
        cd /tmp/case && \
        echo "=== Debug: Contents of /tmp/case ===" && \
        ls -la && \
        {solver} && \
        mkdir -p {container_case_path} && \
        cp -r /tmp/case/* {container_case_path}/ || \
        (echo "Command failed with status $?" && exit 1)'
    ]

    print(f"Running command: {command}")
    print(f"Mounting: {case_dir} -> {container_case_path}")
    print("⏳ Starting Docker container...")

    container = None
    try:
        # Ensure the output directory is writable by the container
        if case_dir:
            # Use sudo to change permissions
            subprocess.run(['sudo', 'chmod', '-R', '777', case_dir], check=True)
            # Set ownership to current user
            import pwd, grp
            uid = pwd.getpwuid(os.getuid()).pw_uid
            gid = grp.getgrgid(os.getgid()).gr_gid
            subprocess.run(['sudo', 'chown', '-R', f'{uid}:{gid}', case_dir], check=True)
        
        # Mount the case directory to a temporary location and use a volume for the working directory
        volumes = {
            case_dir: {"bind": container_case_path, "mode": "rw"},
            "/tmp/case": {"bind": "/tmp/case", "mode": "rw"}
        }
        
        container_working_dir = "/tmp/case"
        environment = {
            "FOAM_USER_RUN": "/tmp",
            "WM_PROJECT_DIR": "/usr/lib/openfoam/openfoam2412"
        }
        
        # Run as root to avoid permission issues with mounted volumes
        container = client.containers.run(
            image,
            command=command,
            volumes=volumes,
            working_dir=container_working_dir,
            environment=environment,
            detach=True,
            remove=False,
            tty=True,
            stdin_open=True,
            name=f"openfoam_{int(time.time())}",
            user="root",  # Run as root to avoid permission issues
            mem_limit='4g',  # Limit memory usage
            memswap_limit='4g'  # Limit swap usage
        )

        start_time = time.time()
        
        while True:
            try:
                result = container.wait(timeout=30)  # Check every 30 seconds
                break
            except docker.errors.ReadTimeout:
                # Container still running, check if we've exceeded max time
                if time.time() - start_time > max_wait_time:
                    print("❌ Timeout waiting for container to complete")
                    return False
                continue
        
        # Get container logs
        logs = container.logs().decode('utf-8')
        print(logs)
        
        if result['StatusCode'] != 0:
            print(f"❌ Solver failed with status code {result['StatusCode']}")
            return False
        
        # Fix permissions on output files
        if case_dir:
            import pwd, grp
            uid = pwd.getpwuid(os.getuid()).pw_uid
            gid = grp.getgrgid(os.getgid()).gr_gid
            subprocess.run(['sudo', 'chown', '-R', f'{uid}:{gid}', case_dir], check=True)
            subprocess.run(['sudo', 'chmod', '-R', 'u+rwX,go+rX', case_dir], check=True)
            
        return True
        
    except docker.errors.ContainerError as e:
        print(f"❌ Container error: {e}")
        if container:
            logs = container.logs().decode('utf-8')
            print(logs)
        return False
        
    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        if container:
            try:
                container.remove(force=True)
                print("✅ Container cleaned up")
            except Exception as e:
                print(f"⚠️  Warning: Could not remove container: {e}")

def main():
    try:
        # Create parent directories first to avoid FileExistsError
        run_folder = Path("run_folder/incompressible/simpleFoam/pitzDaily")
        run_folder.parent.mkdir(parents=True, exist_ok=True)
        
        container_name = "temp_openfoam_container"
        
        try:
            # Create a local copy of the tutorial using Docker
            print("Extracting tutorial from Docker container...")
            
            # Remove container if it exists
            subprocess.run(["docker", "rm", "-f", container_name], 
                         stderr=subprocess.DEVNULL, 
                         check=False)
            
            # Create a temporary container
            subprocess.run([
                "docker", "create", "--name", container_name,
                "haldardhruv/ubuntu_noble_openfoam:v2412"
            ], check=True)
            
            # Extract the tutorial files
            subprocess.run([
                "docker", "cp", 
                f"{container_name}:/usr/lib/openfoam/openfoam2412/tutorials/incompressible/simpleFoam/pitzDaily/.",
                str(run_folder)
            ], check=True)
            
            print(f"Extracted tutorial to: {run_folder}")
            
        except subprocess.CalledProcessError as e:
            print(f"Error extracting tutorial: {e}")
            raise
            
        finally:
            # Clean up the temporary container
            subprocess.run(["docker", "rm", "-f", container_name], 
                         stderr=subprocess.DEVNULL,
                         check=False)
        
        my_case = FoamCase(str(run_folder))
        print(f"Case cloned to: {my_case.path}")

        # First run blockMesh to generate the mesh
        print("🔄 Running blockMesh...")
        blockmesh_success = run_openfoam_in_docker(
            image="haldardhruv/ubuntu_noble_openfoam:v2412",
            solver="blockMesh",
            case_dir=str(my_case.path),
            openfoam_version="2412",
            bashrc_path="/usr/lib/openfoam/openfoam2412/etc/bashrc"
        )
        
        if not blockmesh_success:
            print("❌ blockMesh failed. Cannot proceed with the simulation.")
            return
        
        # Now run simpleFoam
        print("🔄 Running simpleFoam...")
        success = run_openfoam_in_docker(
            image="haldardhruv/ubuntu_noble_openfoam:v2412",
            solver="simpleFoam",
            case_dir=str(my_case.path),
            openfoam_version="2412",
            bashrc_path="/usr/lib/openfoam/openfoam2412/etc/bashrc"
        )

        if success:
            try:
                # Access results
                if len(my_case) > 0:
                    latest_time = my_case[-1]
                    
                    if "p" in latest_time:
                        pressure = latest_time["p"].internal_field
                        if hasattr(pressure, '__iter__') and not isinstance(pressure, str):
                            print(f"Max pressure: {max(pressure)}")
                        else:
                            print(f"Pressure: {pressure}")
                    
                    if "U" in latest_time:
                        velocity = latest_time["U"].internal_field
                        if hasattr(velocity, '__iter__') and len(velocity) > 0:
                            print(f"Velocity at first cell: {velocity[0]}")
                        else:
                            print(f"Velocity: {velocity}")
                else:
                    print("No time directories found - simulation may not have run successfully")
                    
            except Exception as e:
                print(f"Error accessing results: {e}")
                import traceback
                traceback.print_exc()

        # Clean up
        try:
            my_case.clean()
            print("Case cleaned up successfully")
        except Exception as e:
            print(f"❌ Error: {e}")
            sys.exit(1)
            
    except FileExistsError as e:
        print(f"Directory {run_folder} already exists. Using existing directory.")
        my_case = FoamCase(run_folder)
        # Continue with the rest of your code using the existing case

if __name__ == "__main__":
    main()