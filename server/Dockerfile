# Server Dockerfile - Node.js API Service
FROM node:24-bookworm

WORKDIR /app

# Copy dependency files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src ./src

COPY index.html ./

# Create audio temp directory
RUN mkdir -p /app/aud_tmp

# Expose port
EXPOSE 3000

# Start with tsx (no compilation needed)
CMD npm start
