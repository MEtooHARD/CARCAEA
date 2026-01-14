# Server Dockerfile - Node.js API Service
FROM node:24-bookworm-slim

WORKDIR /app

# Copy dependency files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src ./src

# Copy model metadata
COPY model_metadata/ ./model_metadata/

# Expose port
EXPOSE 3000

# Start with tsx (no compilation needed)
CMD ["npm", "start"]
