import pyvista as pv
import numpy as np

mesh = pv.read(r"e:\Misc\FOAMFlask\tutorial_cases\aerofoilNACA0012Steady\VTK\aerofoilNACA0012Steady_1400.vtk")
if isinstance(mesh, pv.MultiBlock):
    mesh = mesh.combine()

# Compute U_Magnitude
u_data = mesh.point_data["U"]
mesh.point_data["U_Magnitude"] = np.sqrt(np.einsum('ij,ij->i', u_data, u_data))

plotter = pv.Plotter(off_screen=True)
plotter.add_mesh(mesh.outline(), color="black", line_width=2)

normal_vec = [0, 1, 0] # y normal
plotter.add_mesh_slice(
    mesh,
    scalars="U_Magnitude",
    normal=normal_vec,
    cmap="viridis",
    tubing=False,
    widget_color="black"
)

# View XZ plane
plotter.view_xz()

plotter.screenshot("y_slice_test.png")
print("Saved screenshot to y_slice_test.png")
