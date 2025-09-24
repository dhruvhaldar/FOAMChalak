#!/usr/bin/env python3
"""
Cleanup script to remove temporary foamchalak_tmp_* folders.
Run this script to clean up any temporary directories created during previous runs.
"""
import os
import shutil
import glob

def cleanup_temp_folders():
    """
    Remove all temporary folders matching the pattern 'foamchalak_tmp_*' in the current directory.
    """
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    print(f"🔍 Searching for temporary folders in: {script_dir}")
    
    # Find all directories matching the pattern
    temp_dirs = glob.glob(os.path.join(script_dir, 'foamchalak_tmp_*'))
    
    if not temp_dirs:
        print("✅ No temporary folders found to clean up.")
        return
    
    print(f"Found {len(temp_dirs)} temporary folder(s) to remove:")
    
    # Remove each directory
    for temp_dir in temp_dirs:
        try:
            if os.path.isdir(temp_dir):
                print(f"🗑️  Removing: {temp_dir}")
                shutil.rmtree(temp_dir, ignore_errors=True)
                # Verify removal
                if not os.path.exists(temp_dir):
                    print(f"   ✅ Successfully removed")
                else:
                    print(f"   ❌ Failed to remove (directory still exists)")
        except Exception as e:
            print(f"   ❌ Error removing {temp_dir}: {e}")
    
    print("\n✅ Cleanup complete!")

if __name__ == "__main__":
    cleanup_temp_folders()
