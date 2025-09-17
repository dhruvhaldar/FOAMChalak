import os
from pathlib import Path
from foamlib import FoamCase
import docker

def run_case_in_docker(case_path: str):
    """Run the OpenFOAM case using Docker"""
    client = docker.from_env()
    
    image_name = "haldardhruv/ubuntu_noble_openfoam:v2412"
    container_case_path = "/case"   # Neutral mount point
    
    # Detect host UID and GID for permission mapping
    uid = os.getuid()
    gid = os.getgid()
    
    # Command to run the case
    command = (
        "bash -c '"
        "source /usr/lib/openfoam/openfoam2412/etc/bashrc || "
        "source /opt/openfoam2412/etc/bashrc; "   # fallback if needed
        f"cd {container_case_path} && ./Allrun'"
    )
    
    container = client.containers.run(
        image_name,
        command,
        detach=True,
        volumes={case_path: {"bind": container_case_path, "mode": "rw"}},
        user=f"{uid}:{gid}"
    )
    
    # Wait for completion
    result = container.wait()
    logs = container.logs().decode()
    
    container.remove()
    
    return result["StatusCode"] == 0, logs


# Clone and run a case
case_path = "run_folder/incompressible/simpleFoam/motorBike"
my_case = FoamCase(Path(os.environ["FOAM_TUTORIALS"]) / "incompressible/simpleFoam/motorBike").clone(case_path)

# Run the case using Docker instead of local OpenFOAM
success, logs = run_case_in_docker(str(my_case.path))
if not success:
    print(f"Case failed to run. Logs: {logs[-1000:]}")
    exit(1)

# Access results (this part remains the same as it works with local files)
latest_time = my_case[-1]
pressure = latest_time["p"].internal_field
velocity = latest_time["U"].internal_field

print(f"Max pressure: {max(pressure)}")
print(f"Velocity at first cell: {velocity[0]}")

# Clean up
my_case.clean()