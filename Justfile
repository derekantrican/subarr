#!/usr/bin/env just --justfile

# List available commands
default:
    @just --list

# Install all dependencies
install:
    npm install

# Start development server (client on port 3000, server on port 3001)
dev:
    #!/usr/bin/env bash
    echo "Starting development servers..."
    echo "Client will run on http://localhost:3000"
    echo "Server will run on http://localhost:3001"
    # Start server in background
    (cd server && node index.js) &
    SERVER_PID=$!
    # Start client (will proxy API calls to :3001)
    npm --workspace client run start
    # Kill server when client exits
    kill $SERVER_PID 2>/dev/null || true

# Start production server (port 3001)
prod:
    npm --workspace client run build
    NODE_ENV=production node server/index.js

# Build client for production
build:
    npm --workspace client run build

# Start server only (development)
server:
    cd server && node index.js

# Start client only (development)
client:
    npm --workspace client run start

# Run both client and server in parallel (alternative to dev)
dev-parallel:
    #!/usr/bin/env bash
    trap 'kill 0' EXIT
    (cd server && node index.js) &
    npm --workspace client run start &
    wait

# Clean build artifacts
clean:
    rm -rf client/build
    rm -rf node_modules client/node_modules server/node_modules

# Reinstall all dependencies
reinstall: clean install

# Docker commands
docker-build:
    docker build -t subarr .

docker-run:
    docker-compose up -d

docker-stop:
    docker-compose down

docker-logs:
    docker-compose logs -f

# Update from git and reinstall
update:
    git pull
    npm install

# Update and start production server
update-prod: update prod

# Update Docker deployment
update-docker:
    git pull
    docker-compose build --pull
    docker-compose up -d

# Check for outdated packages
outdated:
    npm outdated

# Run tests
test:
    npm --workspace client run test

# Lint check (if configured)
lint:
    @echo "No linting configured yet"

# Show environment info
info:
    @echo "Node version: $(node --version)"
    @echo "NPM version: $(npm --version)"
    @echo "Current directory: $(pwd)"
    @echo "Git branch: $(git branch --show-current 2>/dev/null || echo 'not a git repo')"

# Open in browser
open:
    @open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null || echo "Please open http://localhost:3000 in your browser"