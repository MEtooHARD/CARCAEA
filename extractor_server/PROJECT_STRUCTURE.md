# 音频特征提取服务 - 项目结构设计

## 架构设计原则

1. **单一职责**：每个端口对应一个特征提取函数
2. **无状态**：服务不存储数据，仅处理输入并返回输出
3. **解耦设计**：提取逻辑与 API 层分离
4. **易于扩展**：新增特征只需添加新的提取器和路由

## 项目目录结构

```
extractor_server/
├── Dockerfile                          # Docker 构建配置
├── .dockerignore                       # Docker 忽略列表
├── requirements.txt                    # Python 依赖
├── app.py                              # FastAPI 主应用
├── config.py                           # 全局配置
│
├── extractors/                         # 特征提取模块（业务逻辑）
│   ├── __init__.py
│   ├── base.py                         # 基础提取器类
│   ├── pulse_clarity.py                # 脉动清晰度
│   ├── mode.py                         # 调式（大调/小调）
│   ├── tempo.py                        # 节奏速度 (BPM)
│   ├── loudness.py                     # 响度与包络线
│   └── f0_envelope.py                  # 基频包络线
│
├── routes/                             # API 路由层
│   ├── __init__.py
│   ├── pulse_clarity.py
│   ├── mode.py
│   ├── tempo.py
│   ├── loudness.py
│   └── f0_envelope.py
│
├── schemas/                            # Pydantic 数据模型
│   ├── __init__.py
│   └── responses.py                    # 响应数据结构
│
├── utils/                              # 工具函数
│   ├── __init__.py
│   ├── audio_processor.py              # 音频处理工具
│   └── exceptions.py                   # 自定义异常
│
└── tests/                              # 测试（可选）
    ├── __init__.py
    └── test_extractors.py
```

## API 端口设计

| 特征 | 端口 | 方法 | 输入 | 输出 |
|------|------|------|------|------|
| 脉动清晰度 | `/extract/pulse-clarity` | POST | 音频文件 | `{"pulse_clarity": float}` |
| 调式 | `/extract/mode` | POST | 音频文件 | `{"mode": float, "confidence": float}` |
| 节奏速度 | `/extract/tempo` | POST | 音频文件 | `{"bpm": float, "confidence": float}` |
| 响度包络 | `/extract/loudness` | POST | 音频文件 | `{"loudness_rms": list, "loudness_envelope": list}` |
| 基频包络 | `/extract/f0-envelope` | POST | 音频文件 | `{"f0_values": list, "timestamps": list}` |
| 健康检查 | `/health` | GET | 无 | `{"status": "ok"}` |

## 文件说明

### 核心文件

- **app.py**：FastAPI 应用主文件，路由注册、中间件配置、错误处理
- **config.py**：配置常量（采样率、窗口大小、模型路径等）
- **extractors/base.py**：抽象基类，所有提取器继承

### 提取器模块（extractors/）

每个提取器遵循统一接口：

```python
class AudioExtractor:
    async def extract(self, audio_data: np.ndarray, sr: int) -> dict:
        """提取特征，返回结构化结果"""
        pass
```

### 路由层（routes/）

每个路由负责：
1. 接收音频文件上传
2. 转换为 numpy 数组
3. 调用对应的提取器
4. 格式化响应

### 数据模型（schemas/）

Pydantic 模型用于：
- 请求验证
- 响应序列化
- OpenAPI 文档生成

## 依赖核心包

- **librosa**：音频处理、特征提取（Tempo、Loudness、F0）
- **numpy**：数值计算
- **scipy**：信号处理（滤波）
- **FastAPI**：Web 框架
- **uvicorn**：ASGI 服务器
- **python-multipart**：文件上传支持
- **soundfile**：音频读写

## 特征提取技术栈

| 特征 | 使用库 | 算法 |
|------|--------|------|
| Pulse Clarity | librosa | onset_strength + tempogram |
| Mode | librosa | chroma_stft 交叉相关 |
| Tempo | librosa | beat_track / tempo |
| Loudness | librosa | rms 能量 + 低通滤波 |
| F0 Envelope | librosa.pyin | 基频估计 |

## 环境配置

- **运行环境**：Docker 容器化
- **Python 版本**：3.10+
- **服务端口**：8000（可配置）
- **并发模型**：单 worker（TensorFlow 内存限制）或多 worker（取决于硬件）

## 使用示例

```bash
# 构建镜像
docker build -t audio-extractor:latest -f extractor_server/Dockerfile .

# 运行容器
docker run -p 8000:8000 audio-extractor:latest

# 调用 API
curl -X POST "http://localhost:8000/extract/tempo" \
  -F "file=@audio.wav"

# 响应
{"bpm": 120.5, "confidence": 0.98}
```

## 扩展指南

添加新特征步骤：
1. 在 `extractors/` 创建 `new_feature.py`，实现 `AudioExtractor` 接口
2. 在 `routes/` 创建 `new_feature.py`，编写 HTTP 路由
3. 在 `schemas/responses.py` 添加响应数据模型
4. 在 `app.py` 注册新路由
5. 在 `config.py` 添加相关配置(如需要)
