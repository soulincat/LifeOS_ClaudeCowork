FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy app
COPY . .

# Persist DB in /data when running in container
ENV DATABASE_PATH=/data/lifeos.db
RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "server.js"]
