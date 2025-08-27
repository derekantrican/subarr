# Multi-stage Dockerfile for Subarr
FROM node:alpine3.22 AS base

# Install system dependencies required for better-sqlite3
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite-dev \
    linux-headers

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies (including dev dependencies for building native modules)
RUN npm ci

# Rebuild better-sqlite3 for the current architecture
RUN npm rebuild better-sqlite3

FROM base AS builder

# Copy source code
COPY client/ ./client/
COPY server/ ./server/

# Build the client
RUN npm --workspace client run build

FROM node:alpine3.22 AS production

# Install only runtime dependencies
RUN apk add --no-cache sqlite

# Create non-root user for security
RUN addgroup -g 1001 -S subarr && \
    adduser -S subarr -u 1001

WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=subarr:subarr /app/node_modules ./node_modules
COPY --from=builder --chown=subarr:subarr /app/client/build ./client/build
COPY --from=builder --chown=subarr:subarr /app/server ./server
COPY --from=builder --chown=subarr:subarr /app/package.json ./

# Rebuild native module for runtime architecture (avoids Exec format error)
RUN apk add --no-cache python3 make g++ sqlite-dev linux-headers \
 && npm rebuild better-sqlite3 --build-from-source \
 && apk del python3 make g++ sqlite-dev linux-headers \
 && rm -rf /root/.npm /root/.cache

# Create data directory for database persistence
RUN mkdir -p /app/data && chown subarr:subarr /app/data

# Switch to non-root user
USER subarr

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/playlists || exit 1

# Start the server
CMD ["node", "server/index.js"]
