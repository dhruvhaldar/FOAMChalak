import docker
import os
import sys

def run_openfoam(
    image: str = "haldardhruv/ubuntu_noble_openfoam:v12",
    solver: str = "simpleFoam",
    case_dir: str = None,
    openfoam_version: str = "12"
):
    """
    Run an OpenFOAM solver inside a Docker container and clean up afterwards.

    Parameters
    ----------
    image : str
        Docker image name containing OpenFOAM.
    solver : str
        OpenFOAM solver to run (e.g., simpleFoam, pisoFoam).
    case_dir : str
        Path to the case directory on the host system.
        Defaults to current working directory.
    openfoam_version : str
        OpenFOAM version string (default: "12").
    """

    client = docker.from_env()
    case_dir = case_dir or os.getcwd()

    container_case_path = f"/home/foam/OpenFOAM/{openfoam_version}/run"

    command = (
        "bash -c "
        f"'source /opt/openfoam{openfoam_version}/etc/bashrc "
        f"&& cd {container_case_path} "
        f"&& {solver} -help'"
    )

    container = None
    try:
        # Create and start container
        container = client.containers.run(
            image,
            command,
            detach=True,
            tty=True,
            stdout=True,
            stderr=True,
            volumes={case_dir: {"bind": container_case_path, "mode": "rw"}}
        )

        # Wait for completion and capture logs
        result = container.wait()
        logs = container.logs().decode()

        if result["StatusCode"] == 0:
            print("✅ Solver finished successfully")
            print(logs)
        else:
            print("❌ Solver failed")
            print(logs, file=sys.stderr)

    except docker.errors.ImageNotFound:
        print(f"❌ Docker image not found: {image}", file=sys.stderr)
    except docker.errors.APIError as e:
        print("❌ Docker API error:", str(e), file=sys.stderr)
    finally:
        if container:
            try:
                container.kill()     # kill if still running
            except Exception:
                pass
            try:
                container.remove()   # always remove
            except Exception:
                pass


if __name__ == "__main__":
    # Example run
    run_openfoam(solver="simpleFoam")
