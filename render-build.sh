#!/usr/bin/env bash
# Exit if any command fails
set -o errexit  

# Install Pandoc and Python
apt-get update
apt-get install -y pandoc python3 python3-pip

# Install Python packages
pip3 install -r requirements.txt

# Install Node.js packages
npm install
