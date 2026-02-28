#!/bin/bash

# Manual container start script for Dokploy
# Run this on your Dokploy server via SSH

# Get the latest built image
IMAGE_NAME="docker.io/library/personal-projects-casesapp-gyplke:latest"

# Stop and remove any existing container
docker stop cases-app 2>/dev/null || true
docker rm cases-app 2>/dev/null || true

# Start the container
docker run -d \
  --name cases-app \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DATABASE_URL="$DATABASE_URL" \
  -e NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
  -e NEXTAUTH_URL="https://cases.zenowethu.co.za" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -e AUTH_SECRET="$AUTH_SECRET" \
  -e AUTH_TRUST_HOST=true \
  $IMAGE_NAME

echo "Container started. Check logs with: docker logs -f cases-app"
