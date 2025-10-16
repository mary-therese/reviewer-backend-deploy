#!/usr/bin/env bash
# Exit if any command fails
set -o errexit  

# Update and install system packages
# apt-get update
# apt-get install -y pandoc poppler-utils tesseract-ocr

# Install Python packages
pip3 install -r requirements.txt

# Install Node.js packages (optional, Render usually does this already)
npm install
