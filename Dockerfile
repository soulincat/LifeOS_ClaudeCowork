FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy app directories
COPY core/ ./core/
COPY integrations/ ./integrations/
COPY dashboard/ ./dashboard/
COPY onboarding/ ./onboarding/
COPY mcp-server/ ./mcp-server/
COPY notifications/ ./notifications/
COPY scripts/ ./scripts/
COPY config.example/ ./config.example/

# Persist DB in /data when running in container
ENV DATABASE_PATH=/data/lifeos.db
RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "core/server.js"]
