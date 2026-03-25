"""Slice visualization module for FOAMFlask using Trame.

This module provides interactive slicing capabilities for OpenFOAM datasets.
It demonstrates the simplicity of implementing complex VTK operations with Trame.
"""

import logging
import multiprocessing
import numpy as np
import pyvista as pv
from typing import Dict, Any, Optional

logger = logging.getLogger("FOAMFlask")

class SliceVisualizer:
    """
    Handles slice visualization using Trame and PyVista.
    """

    _process: Optional[multiprocessing.Process] = None

    def __init__(self):
        pass

    def process(self, case_path: str, params: Dict[str, Any], parent_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Starts a Trame process for interactive slicing.

        Args:
            case_path: Path to the case (or specific VTK file).
            params: Visualization parameters (scalar_field, etc.)
            parent_id: Optional ID for chaining (unused for now).
        """
        try:
            # For demo purposes, we assume case_path points to a VTK file or we find one
            # Ideally this logic is shared, but we'll keep it self-contained for the demo.
            target_file = self._resolve_target_file(case_path)
            if not target_file:
                return {"status": "error", "message": "No suitable VTK file found"}

            # Stop existing process if any (simple singleton management for demo)
            if SliceVisualizer._process and SliceVisualizer._process.is_alive():
                SliceVisualizer._process.terminate()

            port_queue = multiprocessing.Queue()

            p = multiprocessing.Process(
                target=_run_slice_trame,
                args=(target_file, params, port_queue),
                daemon=True
            )
            p.start()
            SliceVisualizer._process = p

            result = port_queue.get(timeout=10)
            if "error" in result:
                return {"status": "error", "message": result["error"]}

            return {
                "status": "success",
                "mode": "iframe",
                "src": result["url"],
                "port": result["port"]
            }

        except Exception as e:
            logger.error(f"Slice visualization failed: {e}")
            return {"status": "error", "message": str(e)}

    def _resolve_target_file(self, path_str: str) -> Optional[str]:
        """Helper to find a VTK file if a directory is passed."""
        import os
        from pathlib import Path
        path = Path(path_str)
        if path.is_file():
            return str(path)

        # If directory, find latest VTK
        vtk_files = list(path.rglob("*.vtk")) + list(path.rglob("*.vtp")) + list(path.rglob("*.vtu"))
        if not vtk_files:
            return None
        # Sort by mtime
        return str(max(vtk_files, key=os.path.getmtime))


def _run_slice_trame(file_path: str, params: Dict[str, Any], port_queue: multiprocessing.Queue):
    """
    The independent Trame process for Slicing.
    """
    try:
        import pyvista as pv
        from trame.app import get_server
        from trame.ui.vuetify import VAppLayout
        from trame.widgets import vuetify, html
        from trame.widgets.vtk import VtkRemoteView

        # 1. Setup PyVista
        pv.set_plot_theme("document")
        mesh = pv.read(file_path)

        scalar_field = params.get("scalar_field", "U_Magnitude")

        # Compute if missing
        if scalar_field == "U_Magnitude" and "U_Magnitude" not in mesh.point_data and "U" in mesh.point_data:
             # ⚡ Bolt Optimization: Use einsum for ~3x faster magnitude calculation on large arrays
             u_data = mesh.point_data["U"]
             mesh.point_data["U_Magnitude"] = np.sqrt(np.einsum('ij,ij->i', u_data, u_data))

        # 2. Create Plotter
        plotter = pv.Plotter(off_screen=True)

        # 3. Add the key interactive feature: Slice Widget
        # This one line enables the complex 3D interaction!
        plotter.add_mesh_slice(
            mesh,
            scalars=scalar_field,
            cmap=params.get("colormap", "viridis"),
            tubing=False,
            widget_color="black"
        )

        plotter.reset_camera()

        # 4. Setup Trame Server
        server = get_server(name="foamflask_slice", client_type="vue2")
        state, ctrl = server.state, server.controller

        # 5. Build UI
        with VAppLayout(server) as layout:
            with layout.root:
                # Fullscreen style
                html.Style("html, body, #app { margin: 0; padding: 0; overflow: hidden; height: 100vh; }")

                with vuetify.VContainer(fluid=True, classes="pa-0 fill-height"):
                    # Remote View for Massive Data support
                    view = VtkRemoteView(plotter.ren_win)
                    ctrl.view_update = view.update

        # 6. Bind Port & Start
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('', 0))
            port = s.getsockname()[1]

        port_queue.put({"port": port, "url": f"http://127.0.0.1:{port}/index.html"})

        server.start(
            port=port,
            host="127.0.0.1",
            open_browser=False,
            disable_logging=True
        )

    except Exception as e:
        port_queue.put({"error": str(e)})
