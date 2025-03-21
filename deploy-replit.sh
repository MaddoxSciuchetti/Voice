#!/bin/bash

# Ensure the script exits on any error
set -e

# Install dependencies
echo "Installing dependencies..."
npm install

# Create necessary directories
mkdir -p documents

# Set up environment variables if not already set
if [ ! -f .env ]; then
  echo "Creating .env file..."
  echo "PORT=3000" >> .env
  echo "Please make sure to set your ELEVEN_LABS_API_KEY and OPENAI_API_KEY in the Replit Secrets tab"
fi

# Start the server
echo "Starting server..."
npm start 