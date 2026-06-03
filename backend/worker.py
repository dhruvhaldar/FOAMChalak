import os
import sys
import time
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timezone

import honker
from flask import Flask
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
import docker

# Add parent directory to path so we can import from app
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db, SimulationRun, app, sanitize_error, get_docker_user_config, DOCKER_IMAGE, is_safe_script_name

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("honker_worker")

# Define Honker DB Path
HONKER_DB_PATH = Path("jobs.db")

def get_docker_client():
    try:
        return docker.from_env()
    except Exception as e:
        logger.error(f"Failed to connect to Docker daemon: {e}")
        return None

async def process_job(job, honker_db):
    try:
        payload = job.payload
        run_id = payload.get("run_id")
        command = payload.get("command")
        case_dir = payload.get("case_dir")
        tutorial = payload.get("tutorial")

        logger.info(f"Processing job {job.id} for run {run_id}: {command}")

        # Connect to Flask DB via SQLAlchemy directly to update status
        engine = create_engine(app.config['SQLALCHEMY_DATABASE_URI'])

        # Stream for live logs
        stream = honker_db.stream(f"run_logs_{run_id}")

        with Session(engine) as session:
            run_record = session.get(SimulationRun, run_id)
            if not run_record:
                logger.error(f"Run {run_id} not found in DB.")
                job.ack()
                return

            run_record.status = "Running"
            session.commit()

            start_ts = time.time()
            status = "Completed"
            error_msg = None

            client = get_docker_client()
            if client is None:
                err = "[FOAMFlask] [Error] Docker daemon not available.\n"
                with honker_db.transaction() as tx:
                    stream.publish({"line": err}, tx=tx)
                run_record.status = "Failed"
                session.commit()
                job.ack()
                return

            bashrc = f"/opt/openfoam{app.config.get('OPENFOAM_VERSION', '2506')}/etc/bashrc"
            host_path = Path(case_dir).resolve()
            host_path_str = host_path.as_posix() if os.name == "nt" else str(host_path)

            container_case_path = f"/tmp/FOAM_Run/{host_path.name}"
            volumes = {host_path_str: {"bind": container_case_path, "mode": "rw"}}

            # Prepare the log file
            log_dir = host_path / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            log_file = log_dir / f"run_{run_id}.log"
            run_record.log_file_path = str(log_file)
            session.commit()

            docker_cmd = []
            script_name = None
            if command.startswith("./"):
                script_name = command[2:]
                if not is_safe_script_name(script_name):
                    err = f"[FOAMFlask] [Error] Unsafe script name: {script_name}\n"
                    with honker_db.transaction() as tx:
                        stream.publish({"line": err}, tx=tx)
                    run_record.status = "Failed"
                    session.commit()
                    job.ack()
                    return
                docker_cmd = [
                    "bash", "-c",
                    'source "$1" && cd "$2" && echo "[FOAMFlask] [Debug] Executing in: $(pwd)" && ls -F && chmod +x "$3" && ./"$3"',
                    "run_script", bashrc, container_case_path, script_name
                ]
            else:
                docker_cmd = [
                    "bash", "-c",
                    'source "$1" && cd "$2" && $3',
                    "run_foam_cmd", bashrc, container_case_path, command
                ]

            try:
                run_kwargs = {
                    "detach": True,
                    "tty": False,
                    "volumes": volumes,
                    "working_dir": container_case_path,
                    "environment": {
                        "OMPI_MCA_rmaps_base_oversubscribe": "1",
                        "OMPI_MCA_btl_vader_single_copy_mechanism": "none",
                    }
                }
                run_kwargs.update(get_docker_user_config())

                container = client.containers.run(DOCKER_IMAGE, docker_cmd, **run_kwargs)

                # Update DB with container ID
                run_record.container_id = container.id
                session.commit()

                # Open log file for appending
                with open(log_file, "a", encoding="utf-8") as f:
                    # Iterate over logs
                    for line in container.logs(stream=True):
                        decoded = line.decode(errors="ignore")
                        lower_line = decoded.lower()
                        error_markers = [
                            "fatal error", "foam error", "mpi_abort",
                            "not enough slots", "ill defined primitiveentry"
                        ]

                        out_line = decoded
                        if any(marker in lower_line for marker in error_markers):
                            out_line = f"\n[FOAMFlask] [ALERT] CRITICAL ERROR DETECTED:\n{decoded}"

                        # Write to file
                        f.write(out_line)
                        f.flush()

                        # Publish to stream
                        with honker_db.transaction() as tx:
                            stream.publish({"line": out_line}, tx=tx)

            except Exception as e:
                status = "Failed"
                error_msg = str(e)
                logger.error(f"Error running container: {e}")
                err_line = f"[FOAMFlask] [Error] Failed to start container: {sanitize_error(e)}\n"
                with open(log_file, "a", encoding="utf-8") as f:
                    f.write(err_line)
                with honker_db.transaction() as tx:
                    stream.publish({"line": err_line}, tx=tx)

            finally:
                end_ts = time.time()
                duration = end_ts - start_ts

                # Refresh object to avoid stale state issues before final update
                run_record = session.get(SimulationRun, run_id)
                run_record.status = status
                run_record.end_time = datetime.now(timezone.utc)
                run_record.execution_duration = duration
                session.commit()

                # Publish EOF marker
                with honker_db.transaction() as tx:
                    stream.publish({"EOF": True}, tx=tx)

                # Clean up container if it exists
                try:
                    if 'container' in locals() and container:
                        container.remove(force=True)
                except Exception as e:
                    logger.debug(f"[FOAMFlask] Error removing container: {e}")

                logger.info(f"Finished job {job.id} for run {run_id}. Status: {status}")
                job.ack()

    except Exception as e:
        logger.error(f"Worker crashed processing job {job.id}: {e}", exc_info=True)
        # Attempt to mark job as failed or retry it
        job.retry(delay_s=5, error=str(e))

async def main():
    logger.info(f"Starting Honker worker. Listening on {HONKER_DB_PATH}")
    db = honker.open(str(HONKER_DB_PATH))
    runs_queue = db.queue("runs")

    # This loop claims jobs from the queue and processes them
    async for job in runs_queue.claim("foamflask-worker-1"):
        # You could also dispatch this to an asyncio task for concurrent runs
        await process_job(job, db)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Worker stopped.")
