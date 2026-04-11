# `/extract/complete` - Medical-Grade HRV Prediction Features API

## 概述

`POST /extract/complete` 端点实现了基于研究文献的四阶段医疗级音乐分析管道，用于心率变异性 (HRV) 预测。

**实现基础论文：**
- Bartsch & Wakefield 2005 - 音频缩图自相似矩阵 (SSM)
- Trochidis et al. - HRV 预测系数
- Bernardi et al. - 连续相干性
- Lavezzo et al. - 收敛交叉映射

---

## 端点参数

### 请求 (POST)

```http
POST /extract/complete
Content-Type: multipart/form-data

Parameters:
  file                   : UploadFile (必需) - WAV、MP3、FLAC 或 OGG 音频文件
  thumbnail_duration    : float = 25.0 (秒) - 目标缩图时长
  min_duration          : float = 20.0 (秒) - 最小允许缩图时长
  max_duration          : float = 30.0 (秒) - 最大允许缩图时长
```

### 响应状态

- **200 OK** - 成功提取所有特征
- **400 Bad Request** - 文件格式不支持或音频无效
- **500 Internal Server Error** - 处理过程中的服务器错误

---

## 完整响应格式

```json
{
  "phase_1_global_preprocessing": {},
  "phase_2_global_features": {},
  "phase_2_5_thumbnail_segmentation": {},
  "phase_3_4_medical_grade_output": {}
}
```

---

## PHASE 1: 全曲全局预处理

**输入采样率：** 原始文件采样率 (支持 16-48 kHz)
**输出：** 单声道、峰值归一化后的音频

```json
{
  "phase_1_global_preprocessing": {
    "peak_normalized": true,
    "mono_converted": false
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `peak_normalized` | bool | 是否执行了峰值归一化 |
| `mono_converted` | bool | 是否从立体声转换为单声道 |

---

## PHASE 2: 全曲特征提取

**处理采样率：** 原始音频采样率 (sr)
**特征跳跃长度 (Hop Length)：** 各特征类型不同，详见下表

### 2.1 Tempo (节奏/BPM)

```json
{
  "phase_2_global_features": {
    "tempo": {
      "bpm": 120.5,
      "confidence": 0.87,
      "beat_count": 156,
      "beat_times": [0.0, 0.5, 1.0, ...],
      "onset_strength": [0.1, 0.15, 0.08, ...],
      "onset_times": [0.0, 0.011, 0.023, ...],
      "max_tempogram": [0.21, 0.23, 0.19, ...],
      "tempogram_times": [0.0, 0.011, 0.023, ...]
    }
  }
}
```

| 字段 | 类型 | 采样率/说明 |
|------|------|-----------|
| `bpm` | float | 全曲平均 BPM (beats per minute) |
| `confidence` | float (0-1) | 节奏检测可信度 |
| `beat_count` | int | 检测到的节拍总数 |
| `beat_times` | list[float] | 各节拍的秒级时间戳 |
| `onset_strength` | list[float] | 起音强度序列 |
| `onset_times` | list[float] | 起音对齐时间，采样率: **sr / 512** Hz |
| `max_tempogram` | list[float] | 速度图强度时间线 |
| `tempogram_times` | list[float] | 速度图时间轴，采样率: **sr / 512** Hz |

**Hop Length 配置：**
```python
# config.py
TEMPO_HOP_LENGTH = 512  # 样本
# 对应采样率 = sr / 512 Hz
# 例：sr=22050 => 43 Hz
```

---

### 2.2 Mode (调式分析)

```json
{
  "phase_2_global_features": {
    "mode": {
      "mode": "major",
      "confidence": 0.76,
      "major_strength": 0.72,
      "minor_strength": 0.28,
      "major_strength_timeline": [0.5, 0.6, 0.55, ...],
      "times": [0.0, 0.093, 0.186, ...]
    }
  }
}
```

| 字段 | 类型 | 采样率/说明 |
|------|------|-----------|
| `mode` | str | "major" 或 "minor" |
| `confidence` | float (0-1) | 调式判定可信度 |
| `major_strength` | float (0-1) | 全曲大调强度 |
| `minor_strength` | float (0-1) | 全曲小调强度 |
| `major_strength_timeline` | list[float] | 大调强度时间线 |
| `times` | list[float] | 时间轴，采样率: **sr / 2048** Hz |

**Hop Length 配置：**
```python
# Chroma feature hop length
n_fft = 2048, hop_length = 512
# 对应采样率 = sr / 512 Hz
# 例：sr=22050 => 43 Hz (对齐 Tempo)
```

---

### 2.3 Pulse Clarity (脉动清晰度)

```json
{
  "phase_2_global_features": {
    "pulse_clarity": {
      "pulse_clarity": 0.61,
      "confidence": 0.82,
      "pulse_clarity_timeline": [0.45, 0.58, 0.63, ...],
      "tempogram_times": [0.0, 0.011, 0.023, ...]
    }
  }
}
```

| 字段 | 类型 | 采样率/说明 |
|------|------|-----------|
| `pulse_clarity` | float (0-1) | 全曲节奏规律性指标 |
| `confidence` | float (0-1) | 评估可信度 |
| `pulse_clarity_timeline` | list[float] | 脉动强度时间线 |
| `tempogram_times` | list[float] | 时间轴，采样率: **sr / 512** Hz |

---

### 2.4 Loudness (响度与音乐包络线)

```json
{
  "phase_2_global_features": {
    "loudness": {
      "loudness_rms": [0.1, 0.15, 0.12, ...],
      "loudness_db": [-20.5, -18.3, -19.8, ...],
      "loudness_envelope": [0.09, 0.14, 0.11, ...],
      "loudness_envelope_db": [-21.5, -19.1, -20.6, ...],
      "mean_loudness_db": -18.5,
      "peak_loudness_db": -5.2,
      "dynamic_range_db": 13.3,
      "times": [0.0, 0.023, 0.046, ...]
    }
  }
}
```

| 字段 | 类型 | 采样率/说明 |
|------|------|-----------|
| `loudness_rms` | list[float] | RMS 能量幅度 |
| `loudness_db` | list[float] | dB 单位响度 (相对于最大值 0dB) |
| `loudness_envelope` | list[float] | 低通滤波后的平滑包络线 |
| `loudness_envelope_db` | list[float] | 包络线 dB 版本 |
| `mean_loudness_db` | float | 平均响度 (dB) |
| `peak_loudness_db` | float | 峰值响度 (dB) |
| `dynamic_range_db` | float | 动态范围 = peak - min (dB) |
| `times` | list[float] | 时间轴，采样率: **sr / 2048** Hz |

**Hop Length 配置：**
```python
# config.py
LOUDNESS_HOP_LENGTH = 2048  # 样本
# 对应采样率 = sr / 2048 Hz
# 例：sr=22050 => 10.75 Hz
```

---

### 2.5 F0 Envelope (基频包络线/音高轨迹)

```json
{
  "phase_2_global_features": {
    "f0_envelope": {
      "f0_values": [105.3, 108.2, 0.0, 112.1, ...],
      "f0_confidence": [0.92, 0.89, 0.0, 0.85, ...],
      "f0_voiced": [1, 1, 0, 1, ...],
      "times": [0.0, 0.020, 0.040, ...],
      "mean_f0": 110.2,
      "f0_range": {
        "min": 80.5,
        "max": 220.8
      },
      "voiced_count": 1240
    }
  }
}
```

| 字段 | 类型 | 采样率/说明 |
|------|------|-----------|
| `f0_values` | list[float] | 基频 (Hz)，0 表示无声段 |
| `f0_confidence` | list[float] | 置信度 (0-1)，0 表示无声 |
| `f0_voiced` | list[0 or 1] | 有声/无声标记 (1/0) |
| `times` | list[float] | 时间轴，采样率: **sr / 512** Hz |
| `mean_f0` | float | 有声段平均基频 (Hz) |
| `f0_range.min` | float | 基频最小值 (Hz) |
| `f0_range.max` | float | 基频最大值 (Hz) |
| `voiced_count` | int | 有声帧数 |

**Hop Length 配置：**
```python
# config.py
F0_HOP_LENGTH = 512  # 样本
# 对应采样率 = sr / 512 Hz
# 例：sr=22050 => 43 Hz
# F0_FMIN = 60 Hz (最小基频)
# F0_FMAX = 400 Hz (最大基频)
```

---

## PHASE 2.5: 基于 SSM 的缩图分割

**采样率：** 色度特征 (**sr / 512** Hz，1 Hz 下采样后 1 frame/sec)

```json
{
  "phase_2_5_thumbnail_segmentation": {
    "method": "SSM-based (Bartsch & Wakefield 2005)",
    "start_time_seconds": 42.5,
    "end_time_seconds": 68.2,
    "duration_seconds": 25.7,
    "start_frame": 1821,
    "end_frame": 2921
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `method` | str | 缩图提取方法：自相似矩阵 (SSM) |
| `start_time_seconds` | float | 缩图开始时间 (秒) |
| `end_time_seconds` | float | 缩图结束时间 (秒) |
| `duration_seconds` | float | 实际缩图时长 (秒) |
| `start_frame` | int | 开始帧号 (相对于色度特征) |
| `end_frame` | int | 结束帧号 (相对于色度特征) |

**关键优化：**
- 色度特征：原始 **43 Hz** (sr/512)
- 1 Hz 下采样：1 frame/second (平均池化)
- SSM 计算时间：**0.08 秒** (vs. 2000+ 秒 N²算法)

---

## PHASE 3-4: 医疗级 HRV 聚合输出

**采样率信息：**
- 全曲特征时间线：多种采样率 (上述 Phase 2 各个特征)
- 缩图验证数组：**4 Hz** (立体声-音乐包络线、F0、响度)

```json
{
  "phase_3_4_medical_grade_output": {
    "global_risk_features": {},
    "thumbnail_prediction_features": {},
    "validation_arrays": {},
    "metadata": {}
  }
}
```

---

### 3.1 Global Risk Features (全域风险指标)

```json
{
  "global_risk_features": {
    "mode": "major",
    "mode_score": 0.72,
    "rhythmic_regularity": 0.61,
    "tempo_category": "moderate",
    "tempo_bpm": 120.5,
    "tempo_score": 0.65,
    "dynamic_range_db": 13.3,
    "dynamic_range_normalized": 0.22,
    "mean_loudness_db": -18.5,
    "mean_f0_hz": 110.2,
    "f0_range_hz": 140.3
  }
}
```

| 字段 | 类型 | 范围 | 说明 |
|------|------|------|------|
| `mode` | str | "major"/"minor" | 调式分类 |
| `mode_score` | float | 0-1 | 大调强度 (0=小调，1=大调) |
| `rhythmic_regularity` | float | 0-1 | 脉动清晰度指标 |
| `tempo_category` | str | "slow"/"moderate"/"fast" | 速度分类 |
| `tempo_bpm` | float | - | 平均 BPM |
| `tempo_score` | float | 0-1 | 速度风险评分 |
| `dynamic_range_db` | float | - | 响度动态范围 (dB) |
| `dynamic_range_normalized` | float | 0-1 | 归一化动态范围 |
| `mean_loudness_db` | float | - | 平均响度 (dB) |
| `mean_f0_hz` | float | 60-400 | 平均基频 (Hz) |
| `f0_range_hz` | float | - | 基频范围 (Hz) |

---

### 3.2 Thumbnail Prediction Features (缩图预测特征)

```json
{
  "thumbnail_prediction_features": {
    "mode_mean": 0.70,
    "pulse_clarity_mean": 0.58,
    "tempo_mean_bpm": 119.8,
    "music_envelope_mean": 0.108,
    "music_envelope_std": 0.035,
    "f0_envelope_mean_hz": 111.5,
    "loudness_envelope_mean": 0.105,
    "loudness_stability": 0.94
  }
}
```

| 字段 | 类型 | 采样率 | 说明 |
|------|------|--------|------|
| `mode_mean` | float | 43 Hz | 缩图内平均大调强度 |
| `pulse_clarity_mean` | float | 43 Hz | 缩图内平均脉动清晰度 |
| `tempo_mean_bpm` | float | 43 Hz | 缩图内平均 BPM |
| `music_envelope_mean` | float | 4 Hz | 4Hz 音乐包络线平均值 |
| `music_envelope_std` | float | 4 Hz | 4Hz 音乐包络线标准差 |
| `f0_envelope_mean_hz` | float | 4 Hz | 4Hz 基频平均值 (Hz) |
| `loudness_envelope_mean` | float | 4 Hz | 4Hz 响度平均值 |
| `loudness_stability` | float | 4 Hz | 响度稳定性指标 (1/(1+std)) |

---

### 3.3 Validation Arrays (即时验证数组 @ 4 Hz)

```json
{
  "validation_arrays": {
    "music_envelope_4hz": [0.098, 0.102, 0.115, ... (120 points)],
    "f0_envelope_4hz": [110.5, 112.2, 0.0, 111.8, ... (120 points)],
    "loudness_envelope_4hz": [0.095, 0.108, 0.118, ... (120 points)],
    "sampling_rate_hz": 4.0,
    "array_length": 120
  }
}
```

| 字段 | 类型 | 长度 | 说明 |
|------|------|------|------|
| `music_envelope_4hz` | list[float] | 120 | 缩图音乐包络线 @ 4 Hz |
| `f0_envelope_4hz` | list[float] | 120 | 缩图基频轨迹 @ 4 Hz (0 = 无声) |
| `loudness_envelope_4hz` | list[float] | 120 | 缩图响度包络线 @ 4 Hz |
| `sampling_rate_hz` | float | - | 采样率常量 = 4.0 Hz |
| `array_length` | int | - | 数组长度 = 120 for 30s |

**数组长度计算：**
```
array_length = ceil(thumbnail_duration_seconds * 4)
# 例：25.7 秒 * 4 Hz ≈ 103 点
# 最大：30 秒 * 4 Hz = 120 点
```

---

### 3.4 Metadata (后设信息)

```json
{
  "metadata": {
    "global_confidence_avg": 0.815,
    "coherence_with_user_hrv": null,
    "thumbnail_frame_range": {
      "start": 1821,
      "end": 2921
    }
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `global_confidence_avg` | float (0-1) | 全局特征置信度平均值 |
| `coherence_with_user_hrv` | float or null | 用户实测 HRV 与音乐的相关系数 (可选) |
| `thumbnail_frame_range.start` | int | 缩图起始帧 |
| `thumbnail_frame_range.end` | int | 缩图终止帧 |

---

## 采样率速查表

| 特征类型 | Hop Length | 采样率 (例: sr=22050) | 对应秒数所含帧数 |
|---------|-----------|------------------|------------------|
| **Tempo** | 512 | 43 Hz | 1 sec = 43 frames |
| **Mode** | 512 | 43 Hz | 1 sec = 43 frames |
| **Pulse Clarity** | 512 | 43 Hz | 1 sec = 43 frames |
| **Loudness** | 2048 | 10.75 Hz | 1 sec = 10.75 frames |
| **F0 Envelope** | 512 | 43 Hz | 1 sec = 43 frames |
| **Chroma (Thumbnail SSM)** | 512 | 43 Hz (原), 1 Hz (1Hz下采样后) | - |
| **Validation Arrays @ 4Hz** | - | 4 Hz (固定) | 1 sec = 4 frames |

---

## 完整端点示例

### 请求

```bash
curl -X POST "http://localhost:8000/extract/complete" \
  -F "file=@audio.mp3" \
  -F "thumbnail_duration=25" \
  -F "min_duration=20" \
  -F "max_duration=30"
```

### 响应示例 (简化)

```json
{
  "phase_1_global_preprocessing": {
    "peak_normalized": true,
    "mono_converted": false
  },
  "phase_2_global_features": {
    "tempo": {
      "bpm": 120.5,
      "confidence": 0.87,
      "tempogram_times": [0.0, 0.011, 0.023, ...]
    },
    "mode": {
      "mode": "major",
      "confidence": 0.76,
      "major_strength_timeline": [0.5, 0.6, 0.55, ...]
    },
    "pulse_clarity": {
      "pulse_clarity": 0.61,
      "confidence": 0.82,
      "pulse_clarity_timeline": [0.45, 0.58, 0.63, ...]
    },
    "loudness": {
      "mean_loudness_db": -18.5,
      "dynamic_range_db": 13.3,
      "loudness_envelope": [0.09, 0.14, 0.11, ...]
    },
    "f0_envelope": {
      "mean_f0": 110.2,
      "f0_range": {"min": 80.5, "max": 220.8},
      "f0_values": [105.3, 108.2, 0.0, 112.1, ...]
    }
  },
  "phase_2_5_thumbnail_segmentation": {
    "method": "SSM-based (Bartsch & Wakefield 2005)",
    "start_time_seconds": 42.5,
    "end_time_seconds": 68.2,
    "duration_seconds": 25.7
  },
  "phase_3_4_medical_grade_output": {
    "global_risk_features": {
      "mode": "major",
      "tempo_bpm": 120.5,
      "rhythmic_regularity": 0.61
    },
    "thumbnail_prediction_features": {
      "mode_mean": 0.70,
      "music_envelope_mean": 0.108,
      "f0_envelope_mean_hz": 111.5
    },
    "validation_arrays": {
      "music_envelope_4hz": [0.098, 0.102, 0.115, ...],
      "sampling_rate_hz": 4.0,
      "array_length": 120
    },
    "metadata": {
      "global_confidence_avg": 0.815
    }
  }
}
```

---

## 常见问题

**Q: 为什么 F0 包络线中有 0 值？**
A: 0 值表示检测到的无声段 (unvoiced frames)。计算统计量时应排除这些 0 值。

**Q: 验证数组为什么总是 120 个点？**
A: 4 Hz 采样率 × 30 秒 = 120 点。对于小于 30 秒的缩图，实际点数会更少。

**Q: 如何转换帧索引为秒数？**
A: `time_seconds = frame_index * hop_length / sr`
例：帧 100，hop_length=512，sr=22050 => 100 × 512 / 22050 ≈ 2.32 秒

**Q: 为什么不同特征的时间轴不一致？**
A: 不同特征使用了不同的 Hop Length (512 vs 2048)，因此时间分辨率不同。缩图验证数组统一在 4 Hz，便于便对齐和分析。

---

## 性能基准

| 处理阶段 | 时间 | 音频长度 |
|---------|------|---------|
| Phase 1 (预处理) | <100ms | - |
| Phase 2 (特征提取) | ~5-8秒 | 309 秒音频 |
| Phase 2.5 (SSM 缩图) | ~0.08秒 | 309 秒音频 |
| Phase 3-4 (聚合输出) | ~1-2秒 | - |
| **总计** | **~11-13秒** | **309 秒音频** |

---

## 文件说明

- `routes.py` - HTTP 端点实现
- `master_feature_extractor.py` - 四阶段管道协调器
- `thumbnail_segmenter.py` - SSM 缩图提取 (1 Hz 下采样优化)
- `statistical_aggregator.py` - 医疗级特征聚合
- `resampler.py` - 4 Hz 立体声重采样
- `config.py` - 采样率与 Hop Length 配置

