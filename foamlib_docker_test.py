import os
from pathlib import Path
import docker
import sys
import time
import shutil
from foamlib import FoamCase

def check_disk_space(min_space_gb: float = 5.0) -> bool:
    """Check if there's enough disk space for Docker image"""
    try:
        # Get disk usage for the current directory
        total, used, free = shutil.disk_usage(".")
        free_gb = free / (1024**3)  # Convert bytes to GB
        
        print(f"📊 Disk space available: {free_gb:.2f} GB")
        
        if free_gb < min_space_gb:
            print(f"❌ Insufficient disk space. Need at least {min_space_gb} GB, but only {free_gb:.2f} GB available.")
            return False
        else:
            print(f"✅ Sufficient disk space available ({free_gb:.2f} GB)")
            return True
            
    except Exception as e:
        print(f"⚠️  Could not check disk space: {e}")
        return True  # Continue anyway if we can't check

def get_docker_image_size(image_name: str) -> float:
    """Get the size of a Docker image in GB (estimate)"""
    # Common OpenFOAM image sizes (approximate)
    image_sizes = {
        "haldardhruv/ubuntu_noble_openfoam:v2412": 2.5,  # ~2.5 GB
        "openfoam/openfoam10-paraview56": 3.0,           # ~3.0 GB
        "openfoam/openfoam9": 2.0,                       # ~2.0 GB
        "openfoam/openfoam8": 1.8,                       # ~1.8 GB
    }
    
    # Return estimated size if known, else default to 3GB
    return image_sizes.get(image_name, 3.0)

def pull_docker_image(image_name: str) -> bool:
    """Pull Docker image if not present locally with disk space check"""
    
    # Estimate required disk space (image size + buffer)
    estimated_image_size_gb = get_docker_image_size(image_name)
    required_space_gb = estimated_image_size_gb * 1.5  # Add 50% buffer
    
    print(f"📦 Estimated image size: {estimated_image_size_gb:.1f} GB")
    print(f"💾 Required space (with buffer): {required_space_gb:.1f} GB")
    
    # Check disk space before proceeding
    if not check_disk_space(required_space_gb):
        print("❌ Cannot pull Docker image due to insufficient disk space")
        return False
    
    client = docker.from_env()
    try:
        # Check if image exists locally
        client.images.get(image_name)
        print(f"✅ Docker image '{image_name}' already exists locally")
        return True
    except docker.errors.ImageNotFound:
        print(f"⏳ Docker image '{image_name}' not found locally. Pulling from registry...")
        try:
            # Pull the image with progress tracking
            print("🚀 Starting Docker image pull...")
            pull_output = client.images.pull(image_name)
            print(f"✅ Successfully pulled Docker image: {image_name}")
            
            # Verify the image was pulled successfully
            try:
                image_info = client.images.get(image_name)
                image_size_gb = image_info.attrs['Size'] / (1024**3)
                print(f"📦 Actual image size: {image_size_gb:.2f} GB")
            except:
                pass
                
            return True
        except docker.errors.APIError as e:
            print(f"❌ Failed to pull Docker image: {e}")
            return False
        except Exception as e:
            print(f"❌ Unexpected error during pull: {e}")
            return False
    except Exception as e:
        print(f"❌ Error checking Docker image: {e}")
        return False

def cleanup_old_docker_images() -> bool:
    """Clean up unused Docker images to free up space"""
    try:
        client = docker.from_env()
        print("🧹 Checking for unused Docker images to clean up...")
        
        # Get all images
        images = client.images.list()
        
        # Remove dangling images (none tagged)
        removed_count = 0
        for image in images:
            if not image.tags:  # No tags = dangling image
                try:
                    client.images.remove(image.id)
                    removed_count += 1
                    print(f"🗑️  Removed dangling image: {image.id[:12]}")
                except Exception as e:
                    print(f"⚠️  Could not remove image {image.id[:12]}: {e}")
        
        if removed_count > 0:
            print(f"✅ Removed {removed_count} unused Docker images")
        else:
            print("✅ No unused Docker images found")
            
        return True
        
    except Exception as e:
        print(f"⚠️  Could not clean up Docker images: {e}")
        return False

def run_openfoam_in_docker(
    image: str = "haldardhruv/ubuntu_noble_openfoam:v2412",
    solver: str = "foamRun -solver incompressibleFluid",
    case_dir: str = None,
    openfoam_version: str = "2412"
):
    # First, ensure the Docker image is available
    if not pull_docker_image(image):
        print("❌ Cannot proceed without Docker image")
        
        # Try to clean up space and retry
        print("🔄 Attempting to clean up space and retry...")
        if cleanup_old_docker_images():
            # Retry after cleanup
            if pull_docker_image(image):
                print("✅ Successfully pulled image after cleanup!")
            else:
                return False
        else:
            return False
    
    client = docker.from_env()
    case_dir = str(case_dir) if case_dir else os.getcwd()

    container_case_path = f"/home/foam/OpenFOAM/{openfoam_version}/run"

    command = (
        "bash -c "
        f"'source /opt/openfoam{openfoam_version}/etc/bashrc "
        f"&& cd {container_case_path} "
        f"&& {solver}'"
    )

    print(f"Running command: {command}")
    print(f"Mounting: {case_dir} -> {container_case_path}")
    print("⏳ Starting Docker container...")

    container = None
    try:
        # Create and start container with timeout handling
        container = client.containers.run(
            image,
            command,
            detach=True,
            tty=True,
            stdout=True,
            stderr=True,
            volumes={case_dir: {"bind": container_case_path, "mode": "rw"}}
        )

        # Wait for completion with timeout
        max_wait_time = 3600  # 1 hour timeout
        start_time = time.time()
        
        while True:
            try:
                result = container.wait(timeout=30)  # Check every 30 seconds
                break
            except docker.errors.ReadTimeout:
                # Container still running, check if we've exceeded max time
                if time.time() - start_time > max_wait_time:
                    print("❌ Timeout waiting for container to complete")
                    container.kill()
                    return False
                print("⏳ Container still running...")
                continue

        logs = container.logs().decode()

        if result["StatusCode"] == 0:
            print("✅ Solver finished successfully")
            print(logs[-2000:])  # Show last 2000 characters of logs
            return True
        else:
            print("❌ Solver failed")
            print(logs[-2000:], file=sys.stderr)  # Show last 2000 characters of logs
            return False

    except docker.errors.ImageNotFound:
        print(f"❌ Docker image not found: {image}", file=sys.stderr)
        return False
    except docker.errors.APIError as e:
        print(f"❌ Docker API error: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        return False
    finally:
        if container:
            try:
                container.remove(force=True)
                print("✅ Container cleaned up")
            except Exception as e:
                print(f"⚠️  Warning: Could not remove container: {e}")

# Create parent directories first to avoid FileExistsError
run_folder = Path("run_folder/incompressible/simpleFoam/pitzDaily")
run_folder.parent.mkdir(parents=True, exist_ok=True)

try:
    # Clone and set up the case
    tutorial_path = Path(os.environ["FOAM_TUTORIALS"]) / "incompressible/simpleFoam/pitzDaily"
    print(f"Cloning from: {tutorial_path}")
    
    my_case = FoamCase(tutorial_path).clone(str(run_folder))
    print(f"Case cloned to: {my_case.path}")

    # Run the case using Docker with v2412 image
    success = run_openfoam_in_docker(
        image="haldardhruv/ubuntu_noble_openfoam:v2412",
        solver="foamRun -solver incompressibleFluid",
        case_dir=str(my_case.path),
        openfoam_version="2412"
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
        print(f"Error during cleanup: {e}")

except FileExistsError:
    print(f"Directory {run_folder} already exists. Using existing directory.")
    my_case = FoamCase(run_folder)
    # Continue with the rest of your code using the existing case