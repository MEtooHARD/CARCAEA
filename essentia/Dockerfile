# 使用支援 CUDA 11.8 + cuDNN 8 的基礎鏡像
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

# 安裝 Python 3.11 與基礎工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3-pip \
    gcc g++ make \
    && rm -rf /var/lib/apt/lists/*

# 設定 Python 別名
RUN ln -s /usr/bin/python3.11 /usr/bin/python

ENV LANG C.UTF-8

# 安裝 Python 套件
# 注意：essentia-tensorflow 在 GPU 環境通常需要對應的 tensorflow 依賴
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --default-timeout=1000 \
    "numpy<2" \
    essentia-tensorflow \
    fastapi \
    uvicorn[standard] \
    python-multipart \
    librosa \
    soundfile

WORKDIR /app
COPY weights/ ./weights/
COPY app.py ./
COPY Operation.py ./
COPY Util.py ./

EXPOSE 5000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]