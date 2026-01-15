FROM ubuntu:22.04

ENV LANG C.UTF-8

RUN apt-get update \
    && apt-get -y upgrade \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y \
       python3-pip python3-dev \
       libfftw3-3 libyaml-0-2 libtag1v5 libsamplerate0 \
       libavcodec58 libavformat58 libavutil56 libswresample3 libchromaprint1 \
    && rm -rf /var/lib/apt/lists/*

# Install Essentia with TensorFlow support via pip
RUN pip3 install --no-cache-dir \
    "numpy<2" \
    essentia-tensorflow \
    fastapi \
    uvicorn[standard] \
    python-multipart

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