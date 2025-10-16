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

echo "=== Installing Poppler utils (prebuilt binary) ==="
# Download Poppler 23.10 Linux x86_64 prebuilt
curl -LO https://github.com/ArtifexSoftware/poppler/releases/download/poppler-23.10.0/poppler-23.10.0-linux-x86_64.tar.gz
mkdir -p poppler
tar -xzf poppler-23.10.0-linux-x86_64.tar.gz -C ./poppler
chmod +x poppler/bin/*
export PATH=$PWD/poppler/bin:$PATH

echo "=== Verifying installations ==="
# tesserocr is Python-based; no binary verification needed
pdftotext -v  # From Poppler

echo "=== Build complete! ==="
