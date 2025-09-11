import os
from pathlib import Path
from foamlib import FoamCase

# Clone and run a case
my_case = FoamCase(Path(os.environ["FOAM_TUTORIALS"]) / "incompressible/simpleFoam/pitzDaily").clone("myCase")
my_case.run()

# Access results
latest_time = my_case[-1]
pressure = latest_time["p"].internal_field
velocity = latest_time["U"].internal_field

print(f"Max pressure: {max(pressure)}")
print(f"Velocity at first cell: {velocity[0]}")

# Clean up
my_case.clean()