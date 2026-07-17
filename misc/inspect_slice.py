import pyvista as pv

mesh = pv.read(r"e:\Misc\FOAMFlask\tutorial_cases\aerofoilNACA0012Steady\VTK\aerofoilNACA0012Steady_1400.vtk")
if isinstance(mesh, pv.MultiBlock):
    mesh = mesh.combine()

print("Mesh type:", type(mesh))
print("Mesh bounds:", mesh.bounds)
print("Mesh center:", mesh.center)
print("Available point data arrays:", mesh.point_data.keys())

# Let's try slicing it
slice_x = mesh.slice(normal=[1,0,0])
print("Slice X bounds:", slice_x.bounds)
print("Slice X points:", slice_x.n_points)

slice_y = mesh.slice(normal=[0,1,0])
print("Slice Y bounds:", slice_y.bounds)
print("Slice Y points:", slice_y.n_points)

slice_z = mesh.slice(normal=[0,0,1])
print("Slice Z bounds:", slice_z.bounds)
print("Slice Z points:", slice_z.n_points)
