#!/usr/bin/env bash
set -e
set -o pipefail

echo "=== Installing Node.js dependencies ==="
npm install

echo "=== Setting up Python environment ==="
python3 -m venv venv
source venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt

echo "=== Installing Tesseract OCR (prebuilt binary) ==="
# Download prebuilt Tesseract 5.3.3 Linux x86_64
curl -LO https://github.com/tesseract-ocr/tesseract/releases/download/5.3.3/tesseract-5.3.3-linux-x86_64.tar.gz
mkdir -p tesseract
tar -xzf tesseract-5.3.3-linux-x86_64.tar.gz -C ./tesseract

# Make binary executable
chmod +x tesseract/bin/tesseract

# Add to PATH
export PATH=$PWD/tesseract/bin:$PATH

echo "=== Installing Poppler utils (prebuilt binary) ==="
# Download Poppler 23.10 Linux x86_64 prebuilt
curl -LO https://github.com/ArtifexSoftware/poppler/releases/download/poppler-23.10.0/poppler-23.10.0-linux-x86_64.tar.gz
mkdir -p poppler
tar -xzf poppler-23.10.0-linux-x86_64.tar.gz -C ./poppler

# Make binaries executable
chmod +x poppler/bin/*

# Add to PATH
export PATH=$PWD/poppler/bin:$PATH

echo "=== Verifying installations ==="
tesseract --version
pdftotext -v

echo "=== Build complete! ==="
