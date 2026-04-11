# `/extract/complete` 端点规格汇总 (Summary)

## 一句话总结

`POST /extract/complete` 是一个医疗级音频特征提取端点，实现了基于研究文献的四阶段 HRV 预测管道，返回全曲全局特征 + 缩图代表特征 + 4Hz 验证数组。

---

## 📊 规格速查表

### 输入
```
File: WAV / MP3 / FLAC / OGG (22050 Hz 常见)
Optional: thumbnail_duration (秒, 默认 25.0)
```

### 输出
```
200 OK: {
  phase_1_global_preprocessing,
  phase_2_global_features,
  phase_2_5_thumbnail_segmentation,
  phase_3_4_medical_grade_output
}

Size: ~7-12 MB (309s 音频例)
Time: ~12.9 秒 (309s 音频例)
```

---

## 🎯 采样率一览

### 特征时间线采样率

| 特征 | Hop Length | 采样率 (sr=22050) | 时间分辨率 |
|------|-----------|------------------|---------|
| **Tempo** | 512 | 43 Hz | 23 ms |
| **Mode** | 512 | 43 Hz | 23 ms |
| **Pulse Clarity** | 512 | 43 Hz | 23 ms |
| **F0 Envelope** | 512 | 43 Hz | 23 ms |
| **Loudness** | 2048 | 10.75 Hz | 93 ms |
| **Validation @ 4Hz** | - | 4 Hz | 250 ms |

### 关键采样率公式

```
特征采样率 = sr / Hop_Length

例 (sr = 22050 Hz):
  Tempo 采样率 = 22050 / 512 = 43 Hz
  Loudness 采样率 = 22050 / 2048 = 10.75 Hz
  Validation 采样率 = 4.0 Hz (固定)
```

---

## 🔄 四阶段管道概览

### Phase 1: 预处理 (全曲)
```json
{
  "phase_1_global_preprocessing": {
    "peak_normalized": true,
    "mono_converted": false
  }
}
```
- 峰值正规化到 ±1.0
- 立体声转单声道 (如需要)

### Phase 2: 特征提取 (全曲，并行)

```python
# 采样率一致的特征组 (43 Hz @ sr=22050)
tempo_timeline      # BPM 时间线
mode_timeline       # 大调强度时间线
pulse_clarity_timeline  # 脉动清晰度时间线
f0_timeline        # 基频时间线 (0=无声)

# 单独采样率 (10.75 Hz @ sr=22050)
loudness_timeline  # 响度包络线

# 全局统计
tempo_bpm, mode, pulse_clarity, loudness_db, f0_mean
```

### Phase 2.5: 缩图分割 (SSM 优化)

```python
# 原始色度特征 @ 43 Hz (13,287 帧)
# ↓ 1 Hz 下采样 (平均池化)
# ↓ SSM 计算 & 最优匹配
# → 输出缩图 (25.7 秒 = 帧 1820-2921)

{
  "start_time_seconds": 42.5,
  "end_time_seconds": 68.2,
  "duration_seconds": 25.7
}
```

**优化结果：**
- SSM 元素: 177M → 95K (**99.95% 削减**)
- 计算时间: 2000+ 秒 → 0.08 秒 (**25,000x 加速**)

### Phase 3-4: 医疗聚合 (缩图区间 @ 4 Hz)

```json
{
  "global_risk_features": {
    // 全曲统计 (11 字段)
    "mode": "major",
    "tempo_bpm": 120.5,
    "rhythmic_regularity": 0.61,
    "mean_loudness_db": -18.5,
    "mean_f0_hz": 110.2,
    ...
  },
  
  "thumbnail_prediction_features": {
    // 缩图平均值 (8 字段)
    "mode_mean": 0.70,
    "tempo_mean_bpm": 119.8,
    "music_envelope_mean": 0.108,
    ...
  },
  
  "validation_arrays": {
    // 4 Hz 向量 (各 ~110-120 点)
    "music_envelope_4hz": [0.098, 0.102, ...],
    "f0_envelope_4hz": [110.5, 112.2, ...],
    "loudness_envelope_4hz": [0.095, 0.108, ...],
    "sampling_rate_hz": 4.0,
    "array_length": 120
  }
}
```

---

## 🎛️ 可调整参数

```python
# /extract/complete?
thumbnail_duration   # 目标时长 (秒) [default: 25.0]
min_duration         # 最小允许 [default: 20.0]
max_duration         # 最大允许 [default: 30.0]
```

---

## 📐 关键公式与计算

### 帧号 ↔ 秒数转换

```python
# 对于特定特征的时间线
time_sec = frame_index × (hop_length / sr)
frame_index = int(time_sec × sr / hop_length)

# 例: Tempo 特征 (hop_length=512, sr=22050)
frame 100 ↔ 100 × (512/22050) ≈ 2.31 秒
```

### 时间线长度计算

```python
# 全曲 309 秒 @ sr=22050
tempo_frames = ceil(309 × 22050 / 512) = 13,287
loudness_frames = ceil(309 × 22050 / 2048) = 3,322

# 缩图 25.7 秒 @ 4 Hz
validation_points = ceil(25.7 × 4) = 103
```

### 响度计算

```python
loudness_db = 20 × log10(max(rms, 1e-5))
loudness_db = loudness_db - max(loudness_db)  # 相对于 0 dB
# 结果: 通常为负值 (例: -18.5 dB)
```

---

## 🔍 特殊处理规则

### F0 (基频) 处理

```python
# 无声段标记为 0
f0_values = [105.3, 108.2, 0.0, 112.1, ...]
f0_voiced = [1, 1, 0, 1, ...]

# 计算平均时应排除 0 值
mean_f0 = mean(f0_values[f0_values > 0])

参数范围:
  F0_FMIN = 60 Hz
  F0_FMAX = 400 Hz
```

### Loudness (响度) 处理

```python
# 采用 Butterworth 低通滤波 (5 阶)
# 截止频率: 2.0 Hz
# 奈奎斯特频率: sr / (2 × 2048)

# 结果: 平滑包络线
loudness_envelope = [0.09, 0.14, 0.11, ...]
```

### Mode (调式) 处理

```python
# 基于色度特征 (12 音 chroma bins)
# 大调 vs 小调分类

mode_score = 0-1 (0=纯小调, 1=纯大调)
mode = "minor" if mode_score < 0.5 else "major"
```

---

## ✅ 数据验证清单

处理响应时的检查项：

```
输入验证:
  ☐ 文件格式正确 (WAV/MP3/FLAC/OGG)
  ☐ 文件大小合理 (<5GB 建议)

输出验证:
  ☐ HTTP 200 OK
  ☐ JSON 可解析 (无无效浮点数)
  ☐ 列表长度一致 (同采样率的特征)
  ☐ 时间戳单调递增
  ☐ BPM > 0 且 < 300
  ☐ F0 值在 60-400 Hz (或 0)
  ☐ dB 值通常为负
  ☐ 置信度在 0-1 范围
  ☐ 缩图时长在 20-30 秒
```

---

## 🚀 性能特性

| 指标 | 数值 |
|------|------|
| 并行提取特征 | 5 个 (Tempo, Mode, Pulse, Loudness, F0) |
| SSM 加速倍数 | **25,000x** |
| 全曲处理时间 | ~3-5 秒 (309s) |
| 缩图处理时间 | ~0.1 秒 (SSM 计算) |
| 聚合输出时间 | ~1-2 秒 |
| **总耗时** | **~12.9 秒** (309s 音频) |

---

## 📚 文档交叉引用

- **完整规格**: [API_SPEC.md](API_SPEC.md)
- **采样率详解**: [SAMPLING_RATE_REFERENCE.md](SAMPLING_RATE_REFERENCE.md)
- **JSON 结构**: [JSON_RESPONSE_STRUCTURE.md](JSON_RESPONSE_STRUCTURE.md)
- **导航指南**: [SPEC_NAVIGATION.md](SPEC_NAVIGATION.md)

---

## 🔗 集成示例

### cURL

```bash
curl -X POST "http://localhost:8000/extract/complete" \
  -F "file=@audio.mp3" \
  -F "thumbnail_duration=25.0" > result.json

# 提取单个字段
jq '.phase_3_4_medical_grade_output.global_risk_features.tempo_bpm' result.json
# 输出: 120.5
```

### Python

```python
import requests, json

response = requests.post(
    "http://localhost:8000/extract/complete",
    files={"file": open("audio.mp3", "rb")}
)

data = response.json()

# 全局特征
print(f"Tempo: {data['phase_3_4_medical_grade_output']['global_risk_features']['tempo_bpm']} BPM")

# 验证数组
music_env = data['phase_3_4_medical_grade_output']['validation_arrays']['music_envelope_4hz']
print(f"Music envelope: {len(music_env)} points @ 4 Hz")
```

---

## 🎓 研究背景

此端点实现基于以下研究：

1. **Bartsch & Wakefield 2005** - SSM 自相似矩阵
2. **Trochidis et al.** - 音乐特征与 HRV 相关系数
3. **Bernardi et al.** - 调式与心理生理反应
4. **Lavezzo et al.** - 收敛交叉映射 (Convergent Cross-Mapping)

---

## 版本信息

- **API 版本**: 1.0
- **发布日期**: 2026-04-09
- **状态**: 完全规格化 ✅

---

## 快速决策树

```
我想要什么?

├─ "总体想整合 API"
│  └→ 阅读 SPEC_NAVIGATION.md 场景 1
│
├─ "处理时间轴/对齐数据"
│  └→ 阅读 SAMPLING_RATE_REFERENCE.md
│
├─ "解析 JSON 响应"
│  └→ 阅读 JSON_RESPONSE_STRUCTURE.md
│
└─ "理解单个特征"
   └→ 阅读 API_SPEC.md Phase 2
```

