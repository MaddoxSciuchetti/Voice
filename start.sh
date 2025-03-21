#!/bin/bash

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js to run this application."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm is not installed. Please install npm to run this application."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Check if .env file exists, create if not
if [ ! -f ".env" ]; then
    echo "Creating .env file with ElevenLabs API key..."
    echo "ELEVEN_LABS_API_KEY=sk_02eb80050d6c5d8493d5fc87c328e9afc887f5437038e41f" > .env
    echo "ELEVEN_LABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL" >> .env
    echo "PORT=3000" >> .env
fi

# Start the server
echo "Starting the voice assistant server..."
npm start 