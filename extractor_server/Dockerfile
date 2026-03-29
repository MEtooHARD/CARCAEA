# 多阶段构建：编译阶段
FROM python:3.10.12-slim AS builder

# 安装构建依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libsndfile1-dev \
    && rm -rf /var/lib/apt/lists/*

# 创建虚拟环境并安装依赖
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt


# ==================== 运行阶段 ====================

FROM python:3.10.12-slim

# 设置工作目录
WORKDIR /app

# 安装运行时依赖
# - libsndfile1: 音频处理库（soundfile 依赖）
# - ffmpeg: 音频处理工具（librosa 支持，某些格式需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 从构建阶段复制虚拟环境
COPY --from=builder /opt/venv /opt/venv

# 设置环境变量
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# 复制应用代码
COPY . .

# 创建非 root 用户（安全最佳实践）
# RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
# USER appuser

# 暴露端口
EXPOSE 8000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# 启动应用
# - 0.0.0.0:8000: 监听所有网卡的 8000 端口
# - --workers 1: 使用 1 个 worker（无状态设计，可根据 CPU 核心数增加）
# - --loop uvloop: 使用 uvloop 增强事件循环性能
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--loop", "uvloop"]