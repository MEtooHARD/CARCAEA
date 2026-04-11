# 采样率与时间对齐速查表

快速查询各特征提取器的采样率、Hop Length 和时间分辨率。

---

## 1. 特征提取器采样率矩阵

### 原始音频
- **配置采样率 (sr):** 由输入文件决定 (16-48 kHz)
- **支持格式:** WAV, MP3, FLAC, OGG
- **处理方式:** 单声道转换 (如必需)
- **归一化:** 峰值正规化到 ±1.0

---

### 特征时间线采样率

| 特征提取器 | Hop Length (samples) | 采样率 (Hz) | 时间分辨率 | 对齐关系 |
|-----------|------------------|----------|---------|--------|
| **Tempo** | 512 | sr/512 | Δt = 512/sr | ✓ 与 Mode 对齐 |
| **Mode** | 512 | sr/512 | Δt = 512/sr | ✓ 与 Tempo 对齐 |
| **Pulse Clarity** | 512 | sr/512 | Δt = 512/sr | ✓ 与 Tempo/Mode 对齐 |
| **F0 Envelope** | 512 | sr/512 | Δt = 512/sr | ✓ 与 Tempo 对齐 |
| **Loudness** | 2048 | sr/2048 | Δt = 2048/sr | ✗ 独立采样率 |

---

### 具体数值示例 (sr = 22050 Hz)

| 特征提取器 | Hop Length | 采样率 | 时间分辨率 | 309秒音频帧数 |
|-----------|----------|--------|---------|------------|
| Tempo | 512 | **43 Hz** | ~23 ms | ~13,287 frames |
| Mode | 512 | **43 Hz** | ~23 ms | ~13,287 frames |
| Pulse Clarity | 512 | **43 Hz** | ~23 ms | ~13,287 frames |
| F0 Envelope | 512 | **43 Hz** | ~23 ms | ~13,287 frames |
| Loudness | 2048 | **10.75 Hz** | ~93 ms | ~3,322 frames |

---

## 2. 缩图分割与 SSM

### 色度特征 (Chroma Features)
```
Hop Length: 512 samples
基础采样率: sr / 512 Hz (43 Hz @ sr=22050)
```

### 自相似矩阵 (SSM) 优化
```
原始色度: 43 Hz (13,287 frames for 309s)
1 Hz 下采样: 1 frame/sec (309 frames for 309s)
   方法: 平均池化
   益处: N² 算法 => 177M cells 减至 95K cells

SSM 计算时间:
  原始: 2000+ 秒 (Python 循环)
  优化: 0.08 秒 (向量化)
  加速比: 25,000x
```

---

## 3. 缩图验证数组 (4 Hz 固定采样)

### 重采样器 (Resampler) 配置

```python
# 目标采样率（固定）
TARGET_RATE = 4.0  # Hz

# 缩图时长与数组长度
duration = 25 秒 => ceil(25 * 4) = 100 points
duration = 30 秒 => ceil(30 * 4) = 120 points
```

### 输出数组内容

| 数组名 | 采样率 | 含义 | 时间间隔 |
|-------|--------|------|---------|
| `music_envelope_4hz` | 4 Hz | 音乐包络线 (RMS 响度) | 250 ms |
| `f0_envelope_4hz` | 4 Hz | 基频轨迹 (0=无声) | 250 ms |
| `loudness_envelope_4hz` | 4 Hz | 响度包络线 (dB 单位) | 250 ms |

---

## 4. 帧与秒数互转公式

### 标准公式

```
秒数 = 帧索引 × Hop_Length / sr
帧索引 = 秒数 × sr / Hop_Length
```

### 常见场景

**场景 1: Tempo 特征中的第 100 帧对应秒数**
```
秒数 = 100 × 512 / 22050 = 2.31 秒
```

**场景 2: 缩圖開始於 42.5 秒，對應 Tempo 幀索引**
```
帧索引 = 42.5 × 22050 / 512 = 1,820.3 ≈ 1,820 帧
```

**场景 3: 4Hz 验证数组第 50 点对应秒数**
```
秒数 = 50 / 4.0 = 12.5 秒 (相对于缩圖開始)
```

---

## 5. 响度计算细节

### RMS → dB 转换

```python
loudness_rms = librosa.feature.rms(y, hop_length=2048)[0]
loudness_db = 20 * np.log10(np.maximum(loudness_rms, 1e-5))
loudness_db = loudness_db - np.max(loudness_db)  # 相对于最大值 0 dB
```

### 响度包络线 (低通滤波)

```
Butterworth 低通滤波器
阶次: LOUDNESS_FILTER_ORDER = 5
截止频率: LOUDNESS_CUTOFF_FREQ = 2.0 Hz
Nyquist 频率: sr / (2 × 2048) Hz

例 (sr=22050):
  Nyquist = 22050 / 4096 ≈ 5.38 Hz
  正常化截止 = 2.0 / 5.38 ≈ 0.37
```

---

## 6. 基频 (F0) 处理特殊情况

### PYIN / YIN 参数

```python
# config.py
F0_FMIN = 60 Hz      # 最小可检测基频
F0_FMAX = 400 Hz     # 最大可检测基频
F0_HOP_LENGTH = 512  # 采样率 = sr / 512 Hz

# 例子 (sr=22050)
基频采样率 = 22050 / 512 = 43 Hz
```

### 无声处理

```
f0_values 中的 0 值 = 无声段 (unvoiced)
f0_confidence 为 0 或很低时 = 低置信度有声段

聚合时应：
  mean_f0 = mean(f0_values[f0_values > 0])
  避免: mean(f0_values) # 会被 0 拉低
```

---

## 7. 调式 (Mode) 分析

### Chroma 特征

```
n_fft: 2048
hop_length: 512
chroma_bins: 12 (C, C#, D, ..., B)

採樣率 = sr / 512 Hz

例 (sr=22050):
  採樣率 = 43 Hz
  每秒 43 個色度向量
  309 秒 => 13,287 個色度向量
```

### 调式强度时间线

```
major_strength_timeline: 大调强度 [0-1]
时间轴: librosa.frames_to_time(..., sr, hop_length=512)

长度应与 Tempo、Mode、Pulse Clarity 对齐 (均为 43 Hz)
```

---

## 8. 时间轴对齐关键点

### 全曲特征时间轴

```
✓ 对齐组  (43 Hz, hop_length=512):
  - Tempo (beat_times, onset_times, max_tempogram, tempogram_times)
  - Mode (major_strength_timeline, times)
  - Pulse Clarity (pulse_clarity_timeline, tempogram_times)
  - F0 Envelope (f0_values, f0_confidence, f0_voiced, times)

✗ 独立采样率 (10.75 Hz, hop_length=2048):
  - Loudness (loudness_rms, loudness_envelope, loudness_db, times)
```

### 缩图提取时间轴转换

```
输入: 全曲时间轴 (全局秒数)
过滤: thumb_start_time <= t <= thumb_end_time
输出: 相对时间轴 t' = t - thumb_start_time (0 到缩圖時長)

Resampler 期望:
  时间轴从 0 开始
  输入数据点应在 [0, thumbnail_duration] 范围内
```

---

## 9. 配置文件快速查询

### config.py 默认值

```python
# Tempo
TEMPO_HOP_LENGTH = 512
TEMPO_START_BPM = 120

# Mode
MODE_HOP_LENGTH = 512  # (via chroma)

# Pulse Clarity
PULSE_HOP_LENGTH = 512  # (via tempogram)

# Loudness
LOUDNESS_HOP_LENGTH = 2048
LOUDNESS_FILTER_ORDER = 5
LOUDNESS_CUTOFF_FREQ = 2.0

# F0
F0_HOP_LENGTH = 512
F0_FMIN = 60
F0_FMAX = 400
```

---

## 10. 常见时间计算示例

### 示例 1: 一个 309 秒音频的特征数量

```
Tempo (43 Hz):        309 × 43 = 13,287 frames
Loudness (10.75 Hz):  309 × 10.75 = 3,321.75 ≈ 3,322 frames
Chroma (43 Hz):       309 × 43 = 13,287 frames

缩图 SSM:
  原始色度: 13,287 帧 => 177,040,369 元素
  1 Hz 下采样: 309 帧 => 95,481 元素
```

### 示例 2: 缩图 @ 4Hz 的数组大小

```
缩图时长: 25.7 秒
数组长度: ceil(25.7 × 4) = 103 points

内存使用 (float32):
  music_envelope:  103 × 4 bytes = 412 bytes
  f0_envelope:     103 × 4 bytes = 412 bytes
  loudness:        103 × 4 bytes = 412 bytes
  总计: ~1.2 KB (非常紧凑)
```

### 示例 3: 从缩图帧索引回推全曲秒数

```
缩图起始帧: 1,820 (相对于色度特征)
秒数 = 1,820 × 512 / 22050 = 42.5 秒 ✓

缩图结束帧: 2,921
秒数 = 2,921 × 512 / 22050 = 68.1 秒 ✓

缩图时长 = 68.1 - 42.5 = 25.6 秒 ✓
```

---

## 11. 验证数据一致性检查清单

使用 API 响应时，可验证以下一致性：

- [ ] `tempo.tempogram_times` 长度 = `tempo.max_tempogram` 长度
- [ ] `mode.major_strength_timeline` 长度 = `mode.times` 长度
- [ ] `f0_envelope.f0_values` 长度 = `f0_envelope.times` 长度
- [ ] `loudness.loudness_rms` 长度 = `loudness.times` 长度
- [ ] `validation_arrays.array_length` = 实际数组长度
- [ ] `validation_arrays.sampling_rate_hz` == 4.0
- [ ] `metadata.thumbnail_frame_range.start` < `metadata.thumbnail_frame_range.end`

---

## 参考论文

1. **Bartsch & Wakefield (2005)**
   - "To CATCH a Chorus: Using Chroma-Based Representations for Audio Thumbnailing"
   - SSM 缩图提取算法基础

2. **Trochidis et al.**
   - HRV 预测特征系数计算

3. **Bernardi et al.**
   - 音乐调式与心理生理反应

4. **Lavezzo et al.**
   - 收敛交叉映射 (Convergent Cross-Mapping)

