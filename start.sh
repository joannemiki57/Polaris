#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

# Install deps if needed
if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Start dev servers (API + Vite) in the background
npm run dev &
DEV_PID=$!

# Wait for Vite to be ready, then open the browser
echo "⏳ Waiting for dev server..."
until curl -s http://localhost:5173 > /dev/null 2>&1; do
  sleep 0.5
done

echo "🚀 Opening http://localhost:5173"
open http://localhost:5173

# Keep running until Ctrl-C
trap "kill $DEV_PID 2>/dev/null; exit" INT TERM
wait $DEV_PID
