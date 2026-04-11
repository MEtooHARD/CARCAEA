# Audio Feature Extractor Service

一个高效的音频特征提取微服务，支持从音频文件中提取 5 种核心音乐特征。

## 特性

- 🎵 **5 个独立的特征提取端点**，支持一键调用
- 🚀 **FastAPI + Uvicorn**，高性能异步 Web 框架
- 🐳 **Docker 容器化部署**，开箱即用
- 🔧 **模块化架构**，易于扩展新特征
- 📊 **无状态设计**，仅处理计算，无数据持久化
- 🔍 **完整的 OpenAPI 文档**，自动生成 Swagger UI

## 支持的特征

| 特征 | 端点 | 说明 |
|------|------|------|
| **Pulse Clarity** 脉动清晰度 | `/extract/pulse-clarity` | 节拍的规律性与强度 |
| **Mode** 调式 | `/extract/mode` | 大调/小调判断 (0-1) |
| **Tempo** 节奏速度 | `/extract/tempo` | 估算音乐 BPM |
| **Loudness** 响度 | `/extract/loudness` | RMS 能量与音量包络线 |
| **F0 Envelope** 基频包络线 | `/extract/f0-envelope` | 旋律起伏与基频轨迹 |

## 📖 完整 API 规格文档

✨ **新增：医疗级 HRV 预测管道** (`/extract/complete`)

### 规格文档导航

- **[SPEC_NAVIGATION.md](SPEC_NAVIGATION.md)** ⭐ **从这里开始** - 快速导航所有规格
- **[API_SPEC.md](API_SPEC.md)** - 完整的 API 规格 + 采样率汇总表
- **[SAMPLING_RATE_REFERENCE.md](SAMPLING_RATE_REFERENCE.md)** - 采样率详解 + 时间轴对齐
- **[JSON_RESPONSE_STRUCTURE.md](JSON_RESPONSE_STRUCTURE.md)** - JSON 树状结构 + 数据提取示例

### 核心特性

✅ **四阶段医疗级管道**
- Phase 1: 全曲预处理 (峰值正规化)
- Phase 2: 并行特征提取 (Tempo, Mode, Pulse Clarity, Loudness, F0)
- Phase 2.5: SSM 缩图分割 (1 Hz 优化，**25,000x 加速**)
- Phase 3-4: 医疗聚合输出 (4 Hz 验证数组)

✅ **采样率覆盖**
- 特征时间线: 43 Hz, 10.75 Hz (取决于 Hop Length)
- 验证数组: 固定 4 Hz (缩图区间)
- 支持音频采样率: 16-48 kHz

✅ **性能基准**
- 309 秒音频处理: **~12.9 秒**
- SSM 计算: 0.08 秒 (vs 2000+ 秒原始算法)
- 输出 JSON: 7-12 MB

## 快速开始

### 1. 本地运行（无 Docker）

**安装依赖：**
```bash
cd extractor_server
pip install -r requirements.txt
```

**启动服务：**
```bash
python app.py
```

服务将在 `http://localhost:8000` 启动，API 文档在 `http://localhost:8000/docs`

### 2. Docker 容器运行

**构建镜像：**
```bash
# 从项目根目录执行
docker build -t audio-extractor:latest -f extractor_server/Dockerfile .
```

**运行容器：**
```bash
docker run -d -p 8000:8000 --name audio-extractor audio-extractor:latest
```

**停止容器：**
```bash
docker stop audio-extractor
docker rm audio-extractor
```

## API 使用示例

### 提取 BPM (Tempo)

```bash
curl -X POST "http://localhost:8000/extract/tempo" \
  -F "file=@example.wav"
```

**响应：**
```json
{
  "bpm": 120.5,
  "confidence": 0.98,
  "beat_times": [0.0, 0.5, 1.0, ...],
  "beat_count": 48,
  "onset_strength": [...],
  "onset_times": [...]
}
```

### 提取调式 (Mode)

```bash
curl -X POST "http://localhost:8000/extract/mode" \
  -F "file=@example.wav"
```

**响应：**
```json
{
  "mode": 0.85,
  "mode_label": "major",
  "confidence": 0.72,
  "major_strength": 0.95,
  "minor_strength": 0.45,
  "chroma_mean": [1.0, 0.0, 0.89, ...],
  "chroma": [...],
  "times": [...]
}
```

### 提取响度 (Loudness)

```bash
curl -X POST "http://localhost:8000/extract/loudness" \
  -F "file=@example.wav"
```

**响应：**
```json
{
  "loudness_rms": [...],
  "loudness_db": [...],
  "loudness_envelope": [...],
  "loudness_envelope_db": [...],
  "mean_loudness_db": -15.3,
  "peak_loudness_db": 0.0,
  "min_loudness_db": -35.2,
  "dynamic_range_db": 35.2,
  "times": [...]
}
```

### 提取基频包络线 (F0 Envelope)

```bash
curl -X POST "http://localhost:8000/extract/f0-envelope" \
  -F "file=@example.wav"
```

**响应：**
```json
{
  "f0_values": [100.5, 102.3, null, 105.1, ...],
  "f0_confidence": [0.95, 0.92, 0.0, 0.88, ...],
  "f0_voiced": [1, 1, 0, 1, ...],
  "times": [...],
  "mean_f0": 150.5,
  "f0_range": {"min": 80.0, "max": 280.5},
  "voiced_count": 486,
  "total_frames": 512,
  "voicing_ratio": 0.95
}
```

### 提取脉动清晰度 (Pulse Clarity)

```bash
curl -X POST "http://localhost:8000/extract/pulse-clarity" \
  -F "file=@example.wav"
```

**响应：**
```json
{
  "pulse_clarity": 0.78,
  "confidence": 0.65,
  "onset_strength": [...],
  "onset_times": [...],
  "max_tempogram": [...],
  "tempogram_times": [...]
}
```

## 项目结构

```
extractor_server/
├── app.py                   # FastAPI 主应用
├── config.py                # 全局配置常量
├── requirements.txt         # Python 依赖
├── Dockerfile              # Docker 构建配置
├── .dockerignore           # Docker 忽略列表
├── routes.py               # API 路由层
├── schemas.py              # Pydantic 数据模型
├── utils.py                # 工具函数（音频处理）
├── extractors/             # 特征提取模块
│   ├── base.py             # 抽象基类
│   ├── pulse_clarity.py    # 脉动清晰度提取器
│   ├── mode.py             # 调式提取器
│   ├── tempo.py            # 节奏提取器
│   ├── loudness.py         # 响度提取器
│   └── f0_envelope.py      # 基频包络线提取器
└── README.md               # 本文件
```

## 配置调整

在 `config.py` 中可以调整以下参数：

```python
# 音频处理
DEFAULT_SAMPLE_RATE = 22050       # 采样率
AUDIO_MONO = True                 # 转换为单声道

# 脉动清晰度
PULSE_CLARITY_HOP_LENGTH = 512    # 帧移长度
PULSE_CLARITY_FMIN = 60           # 最小频率
PULSE_CLARITY_FMAX = 240          # 最大频率

# 调式
MODE_CHROMA_TYPE = "stft"         # "stft" 或 "cqt"

# 节奏
TEMPO_HOP_LENGTH = 512            # 帧移长度

# 响度
LOUDNESS_FILTER_ORDER = 5         # 低通滤波阶数
LOUDNESS_CUTOFF_FREQ = 5          # 截止频率 (Hz)

# 基频
F0_FMIN = 80                       # 最小基频 (Hz)
F0_FMAX = 400                      # 最大基频 (Hz)

# 服务
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 最大上传文件大小
```

## 支持的音频格式

- **WAV** (.wav)
- **MP3** (.mp3)
- **FLAC** (.flac)
- **OGG** (.ogg)
- **M4A** (.m4a) — 需要 ffmpeg

## 性能优化建议

### 1. 多 Worker 并发处理

如果音频文件较小且硬件资源充足，可以增加 worker 数量：

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --workers 4
```

在 Dockerfile 中修改 CMD：
```dockerfile
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

### 2. 使用 Gunicorn + Uvicorn

```dockerfile
RUN pip install gunicorn

CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "app:app", "--bind", "0.0.0.0:8000"]
```

### 3. 负载均衡

使用 Nginx 或其他反向代理在多个容器副本前：

```yaml
version: '3'
services:
  extractor:
    image: audio-extractor:latest
    deploy:
      replicas: 3
    ports:
      - "8000"
```

## 监控与日志

### 访问日志

服务自动记录所有请求和响应：

```
INFO:     2025-03-27 10:15:32 - POST /extract/tempo
INFO:     Response status: 200
```

### 健康检查

```bash
curl http://localhost:8000/health
# 响应: {"status":"ok"}
```

## 扩展新特征

添加新的特征提取功能只需 3 个步骤：

1. **创建提取器** — 在 `extractors/` 下创建新文件，继承 `AudioExtractor`
2. **定义资源模型** — 在 `schemas.py` 中添加 Pydantic 响应模型
3. **创建路由** — 在 `routes.py` 中添加新的 `@router.post()` 端点

示例：

```python
# extractors/my_feature.py
class MyFeatureExtractor(AudioExtractor):
    async def extract(self, audio_data: np.ndarray, sr: int) -> dict:
        # 提取逻辑
        return {"feature_value": 0.5}

# schemas.py
class MyFeatureResponse(BaseModel):
    feature_value: float

# routes.py
@router.post("/my-feature", response_model=MyFeatureResponse)
async def extract_my_feature(file: UploadFile = File(...)):
    # 路由逻辑
    pass
```

## 常见问题 (FAQ)

### Q: 如何处理长音频文件？
A: 可以增加 `MAX_UPLOAD_SIZE` 或分段提取

### Q: 支持批量处理吗？
A: 当前设计为单文件单特征。如需批量，可添加异步队列

### Q: 如何优化音频质量？
A: 在 `config.py` 调整采样率或在 `utils.py` 的 `load_audio_from_bytes` 中添加预处理

### Q: 容器内存占用量？
A: librosa + numpy 通常 100-300MB，取决于音频长度

## 依赖库

- **librosa** >= 0.11.0 - 音频处理与特征提取
- **numpy** < 2.0 - 数值计算
- **scipy** >= 1.11.0 - 信号处理
- **soundfile** >= 0.13.1 - 音频 I/O
- **FastAPI** >= 0.128.0 - Web 框架
- **uvicorn** >= 0.40.0 - ASGI 服务器
- **pydantic** >= 2.0.0 - 数据验证

## 许可证

MIT

## 联系方式

如有问题或建议，欢迎提 Issue 或 PR。
