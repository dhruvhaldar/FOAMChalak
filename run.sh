#!/bin/bash

# Activate the virtual environment
source venv/bin/activate

# Install dependencies if not already installed
pip install -r requirements.txt

# Run the Flask application
python app.py
