#!/bin/bash

# Set permissions for the tutorials directory
TUTORIALS_DIR="./tutorials"

# Create the directory if it doesn't exist
mkdir -p "$TUTORIALS_DIR"

# Set ownership to the current user
chown -R $USER:$USER "$TUTORIALS_DIR"

# Set directory permissions to 755 (rwxr-xr-x)
find "$TUTORIALS_DIR" -type d -exec chmod 755 {} \;

# Set file permissions to 644 (rw-r--r--)
find "$TUTORIALS_DIR" -type f -exec chmod 644 {} \;

echo "Permissions set for $TUTORIALS_DIR"
