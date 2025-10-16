#!/usr/bin/env bash
set -e
set -o pipefail

echo "=== Installing Node.js dependencies ==="
npm install

echo "=== Setting up Python environment ==="
python3 -m venv venv
source venv/bin/activate

echo "=== Upgrading pip and installing Python dependencies ==="
pip install --upgrade pip

# Install your Python dependencies including tesserocr for OCR
pip install -r requirements.txt

echo "=== Installing Poppler utils (via apt-get) ==="
apt-get update
apt-get install -y poppler-utils

echo "=== Verifying installations ==="
# tesserocr is Python-based; no binary verification needed
pdftotext -v  # From Poppler

echo "=== Build complete! ==="
