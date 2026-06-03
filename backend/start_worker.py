import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from worker import main
import asyncio

if __name__ == "__main__":
    asyncio.run(main())
