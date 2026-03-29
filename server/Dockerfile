# Server Dockerfile - Node.js API Service
FROM node:24-bookworm

WORKDIR /app

# Install yt-dlp and ffmpeg (required for audio download/conversion)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --break-system-packages --upgrade "yt-dlp[default,curl-cffi]"

RUN curl -fsSL https://deno.land/install.sh | sh

ENV PATH="/root/.deno/bin:${PATH}"

RUN deno --version

# Copy dependency files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src ./src

# Copy model metadata
COPY model_metadata/ ./model_metadata/

COPY index.html ./

# Add cookies file for yt-dlp
COPY cookies.txt ./

# Create audio temp directory
RUN mkdir -p /app/aud_tmp

# Expose port
EXPOSE 3000

# Start with tsx (no compilation needed)
# Upgrade yt-dlp on every startup to handle YouTube's frequent changes
CMD sh -c "python3 -m pip install --break-system-packages --upgrade yt-dlp && npm start"
