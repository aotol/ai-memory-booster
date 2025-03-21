#!/bin/bash
set -e

OS=$(uname)

if [ "$OS" == "Darwin" ]; then
    echo "Detected macOS"

    if ! command -v brew &>/dev/null; then
        echo "Error: Homebrew not found. Please install Homebrew first: https://brew.sh/"
        exit 1
    fi

    brew install node python3 pipenv
    npm install -g npm@latest || true
    npm install -g pm2 || true

elif [ "$OS" == "Linux" ]; then
    echo "Detected Linux"

    if ! command -v apt-get &>/dev/null; then
        echo "Error: This script is only supported on Debian-based Linux or macOS."
        exit 1
    fi

    apt-get update && apt-get install -y curl build-essential python3 python3-pip python3-venv
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    npm install -g npm@latest pm2
else
    echo "Unsupported OS: $OS"
    exit 1
fi

# ----------- Show Versions ----------- #
node -v
npm -v
python3 --version
pip3 --version

# ----------- Setup Chromadb ----------- #
mkdir -p ./chroma_db ./logs

python3 -m venv chromadb-venv
source chromadb-venv/bin/activate
pip install chromadb
chroma run --path ./chroma_db > ./logs/chroma.log 2>&1 &

until curl -s http://127.0.0.1:8000; do
    echo "Waiting for Chromadb to be ready..."
    sleep 2
done

# ----------- Setup Ollama ----------- #
if [ "$OS" == "Darwin" ]; then
    echo "Detected macOS"
    brew install ollama

elif [ "$OS" == "Linux" ]; then
    echo "Detected Linux"
    curl -fsSL https://ollama.com/install.sh | sh
fi
ollama serve > ./logs/ollama.log 2>&1 &
until curl -s http://127.0.0.1:11434/version; do
    echo "Waiting for Ollama to be ready..."
    sleep 2
done
ollama pull llama3.2:latest
ollama pull nomic-embed-text:latest

# ----------- Setup Node.js API ----------- #
npm install
pm2 start ./server/server.js --name ai-memory-booster-api

# ----------- Setup Web UI (Next.js) ----------- #
cd ./web/ai-memory-ui
echo "AI_MEMORY_BOOSTER_API_URL=http://localhost:4000" > .env.local
npm install
npm run build
pm2 start "npx next start -p 3000" --name ai-memory-booster-ui

pm2 save

echo "Install complete! Access the Web UI at http://localhost:3000"
echo "To check logs: pm2 logs"
