FROM python:3.11-slim

ENV LANG C.UTF-8

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       gcc g++ make \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
RUN pip install --no-cache-dir \
    "numpy<2" \
    essentia-tensorflow \
    fastapi \
    uvicorn[standard] \
    python-multipart \
    librosa \
    soundfile

# Create working directory
WORKDIR /app

# Pre-copy model weights (included in the image during build)
COPY weights/ ./weights/

# Copy application
COPY app.py ./
COPY Operation.py ./
COPY Util.py ./


# Expose port
EXPOSE 5000

# Run with uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]