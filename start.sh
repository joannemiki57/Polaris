#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting dev servers (client :5173 + server :8787)..."

npm run dev &
DEV_PID=$!

sleep 3
open "http://localhost:5173" 2>/dev/null \
  || xdg-open "http://localhost:5173" 2>/dev/null \
  || echo "Open http://localhost:5173 in your browser"

wait $DEV_PID
