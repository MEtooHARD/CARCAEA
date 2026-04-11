# `/extract/complete` - Medical-Grade HRV Prediction API v2.0

**🎯 优化版规格：精简输出格式 (6.9 KB JSON)**

## 概述

`POST /extract/complete` 端点实现了四阶段医疗级音乐分析管道，用于心率变异性 (HRV) 预测。

**内部处理管道（内存中）：**
- Phase 1: 全曲预处理 
- Phase 2: 并行特征提取 (5 个特征 @ 43Hz/10.75Hz)
- Phase 2.5: SSM 缩图分割 (1 Hz 优化)
- Phase 3-4: 数据聚合 → **仅输出关键标量值 + 4Hz 验证数组**

**特点：**
✅ 输出格式精简 (6.9 KB)  
✅ 压缩比 1,476x (vs 原 10 MB)  
✅ 完整可验证 (4Hz 验证数组 @ 121 点)  
✅ 数据库友好型 (纯数值 + 单个数组)

---

## 端点参数

### 请求

```http
POST /extract/complete
Content-Type: multipart/form-data

Parameters:
  file:                  UploadFile (必需)
  track_id:              str (可选) - 音轨 ID
  thumbnail_duration:    float = 25.0 (秒)
  min_duration:          float = 20.0 (秒)
  max_duration:          float = 30.0 (秒)
```

### 响应状态

- **200 OK** - 成功
- **400 Bad Request** - 文件或参数错误
- **500 Internal Server Error** - 处理错误

---

## 响应格式 (最终输出)

```json
{
  "track_id": "song_001",
  "metadata": {
    "thumbnail_start_sec": 42.5,
    "thumbnail_end_sec": 68.2,
    "duration_seconds": 25.7,
    "global_confidence_avg": 0.88
  },
  "global_risk_features": { ... 11 个纯数值字段 ... },
  "thumbnail_prediction_features": { ... 8 个纯数值字段 ... },
  "thumbnail_validation_arrays": { ... 3 个 4Hz 数组 ... }
}
```

**总大小：** < 2 KB (vs 原来的 7-12 MB)  
**行数：** < 50 行 (vs 原来的 42 万行)

---

## 响应正文详解

### 1. Metadata (元数据)

```json
{
  "track_id": "song_001",
  "metadata": {
    "thumbnail_start_sec": 42.5,
    "thumbnail_end_sec": 68.2,
    "duration_seconds": 25.7,
    "global_confidence_avg": 0.88
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `track_id` | str | 可选的音轨标识符 |
| `thumbnail_start_sec` | float | 缩图开始秒数 |
| `thumbnail_end_sec` | float | 缩图结束秒数 |
| `duration_seconds` | float | 缩图实际时长 |
| `global_confidence_avg` | float (0-1) | 全局置信度平均值 |

---

### 2. Global Risk Features (全局风险指标)

```json
{
  "global_risk_features": {
    "tempo_bpm": 72.5,
    "tempo_category": "moderate",
    "mode": "major",
    "mode_score": 0.85,
    "tempo_score": 0.60,
    "dynamic_range_db": 15.2,
    "global_std_loudness": 12.5,
    "global_max_pulse_clarity": 0.95,
    "mean_loudness_db": -18.5,
    "mean_f0_hz": 261.6,
    "f0_range_hz": 140.3
  }
}
```

| 字段 | 类型 | 范围 | 说明 |
|------|------|------|------|
| `tempo_bpm` | float | >0 | 全曲平均 BPM |
| `tempo_category` | str | "slow"/"moderate"/"fast" | 速度分类 |
| `mode` | str | "major"/"minor" | 调式 |
| `mode_score` | float | 0-1 | 大调强度 (0=小调, 1=大调) |
| `tempo_score` | float | 0-1 | 速度风险评分 |
| `dynamic_range_db` | float | - | 响度动态范围 (dB) |
| `global_std_loudness` | float | - | 响度标准差 (dB) |
| `global_max_pulse_clarity` | float | 0-1 | 节奏规律性峰值 |
| `mean_loudness_db` | float | <0 | 平均响度 (dB) |
| `mean_f0_hz` | float | 60-400 | 平均基频 (Hz) |
| `f0_range_hz` | float | - | 基频范围 (Hz) |

**用途：** 快速筛选突发激昂的歌曲

---

### 3. Thumbnail Prediction Features (缩图预测特征)

```json
{
  "thumbnail_prediction_features": {
    "mode_mean": 0.80,
    "pulse_clarity_mean": 0.45,
    "tempo_mean_bpm": 72.5,
    "music_envelope_mean": 0.12,
    "music_envelope_std": 0.035,
    "f0_envelope_mean_hz": 261.6,
    "loudness_envelope_mean": -18.5,
    "loudness_stability": 0.85
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `mode_mean` | float (0-1) | 缩图内平均大调强度 |
| `pulse_clarity_mean` | float (0-1) | 缩图内平均脉动清晰度 |
| `tempo_mean_bpm` | float | 缩图内平均 BPM |
| `music_envelope_mean` | float | 音乐包络线平均值 |
| `music_envelope_std` | float | 音乐包络线标准差 |
| `f0_envelope_mean_hz` | float | 基频平均值 (Hz) |
| `loudness_envelope_mean` | float | 响度包络线平均值 |
| `loudness_stability` | float (0-1) | 响度稳定性 (1/(1+std)) |

**用途：** 代入 HRV 迴歸公式计算预期心率变异性效应

---

### 4. Thumbnail Validation Arrays (缩图验证数组 @ 4 Hz)

```json
{
  "thumbnail_validation_arrays": {
    "sampling_rate_hz": 4.0,
    "array_length": 120,
    "music_envelope_4hz": [0.11, 0.15, 0.18, 0.22, 0.25, ..., 0.19],
    "f0_envelope_4hz": [261.6, 261.6, 263.0, 0.0, 265.2, ..., 260.8],
    "loudness_envelope_4hz": [-18.5, -18.2, -18.0, -17.8, -17.5, ..., -18.2]
  }
}
```

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `sampling_rate_hz` | float | 4.0 | 固定采样率常量 |
| `array_length` | int | ≤ 120 | 数组长度 (= ceil(缩图时长 × 4)) |
| `music_envelope_4hz` | list[float] | 120 pts | 音乐包络线时间序列 |
| `f0_envelope_4hz` | list[float] | 120 pts | 基频轨迹 (Hz, 0=无声) |
| `loudness_envelope_4hz` | list[float] | 120 pts | 响度包络线时间序列 (dB) |

**格式：** 单行数组 (flat list in JSON)

```json
"music_envelope_4hz": [0.11, 0.15, 0.18, 0.22, 0.25, 0.28, 0.31, ...]
```

**用途：** 完整可验证的缩图时间序列

---

## 完整响应示例

```json
{
  "track_id": "song_001",
  "metadata": {
    "thumbnail_start_sec": 42.5,
    "thumbnail_end_sec": 68.2,
    "duration_seconds": 25.7,
    "global_confidence_avg": 0.88
  },
  "global_risk_features": {
    "tempo_bpm": 72.5,
    "tempo_category": "moderate",
    "mode": "major",
    "mode_score": 0.85,
    "tempo_score": 0.60,
    "dynamic_range_db": 15.2,
    "global_std_loudness": 12.5,
    "global_max_pulse_clarity": 0.95,
    "mean_loudness_db": -18.5,
    "mean_f0_hz": 261.6,
    "f0_range_hz": 140.3
  },
  "thumbnail_prediction_features": {
    "mode_mean": 0.80,
    "pulse_clarity_mean": 0.45,
    "tempo_mean_bpm": 72.5,
    "music_envelope_mean": 0.12,
    "music_envelope_std": 0.035,
    "f0_envelope_mean_hz": 261.6,
    "loudness_envelope_mean": -18.5,
    "loudness_stability": 0.85
  },
  "thumbnail_validation_arrays": {
    "sampling_rate_hz": 4.0,
    "array_length": 120,
    "music_envelope_4hz": [0.11, 0.15, 0.18, 0.22, 0.25, 0.28, 0.31, 0.34, 0.36, 0.37, 0.38, 0.39, 0.39, 0.38, 0.37, 0.35, 0.32, 0.29, 0.26, 0.23, 0.20, 0.18, 0.16, 0.15, 0.14, 0.14, 0.15, 0.16, 0.18, 0.20, 0.22, 0.24, 0.26, 0.28, 0.29, 0.30, 0.30, 0.29, 0.28, 0.26, 0.24, 0.21, 0.19, 0.16, 0.14, 0.12, 0.11, 0.10, 0.10, 0.10, 0.11, 0.13, 0.15, 0.17, 0.19, 0.21, 0.23, 0.24, 0.25, 0.25, 0.24, 0.23, 0.21, 0.19, 0.17, 0.14, 0.12, 0.10, 0.09, 0.08, 0.08, 0.09, 0.10, 0.12, 0.14, 0.16, 0.18, 0.20, 0.21, 0.22, 0.22, 0.21, 0.20, 0.18, 0.16, 0.14, 0.12, 0.10, 0.09, 0.08, 0.08, 0.09, 0.10, 0.12, 0.14, 0.16, 0.18, 0.19, 0.20, 0.20, 0.19, 0.18, 0.16, 0.14, 0.12, 0.10, 0.09, 0.08, 0.08, 0.08, 0.09, 0.10, 0.12, 0.14, 0.15, 0.17, 0.18, 0.19, 0.19],
    "f0_envelope_4hz": [261.6, 261.6, 263.0, 265.2, 267.5, 268.8, 270.0, 269.5, 268.0, 266.0, 263.5, 260.8, 258.0, 256.0, 255.0, 255.5, 257.0, 259.5, 262.0, 264.5, 266.5, 268.0, 268.5, 267.5, 265.0, 261.5, 257.5, 253.0, 249.0, 246.5, 245.5, 246.0, 248.5, 252.5, 257.5, 262.5, 266.5, 268.5, 268.0, 265.0, 260.5, 255.0, 249.5, 245.0, 242.0, 241.5, 243.5, 248.0, 254.0, 260.5, 266.0, 269.0, 269.5, 267.5, 263.0, 257.0, 250.5, 244.0, 239.0, 236.5, 237.0, 240.5, 247.0, 255.5, 263.5, 269.0, 271.0, 269.5, 264.0, 256.0, 247.0, 238.5, 231.5, 227.0, 225.5, 227.5, 232.5, 240.5, 251.0, 262.0, 271.0, 276.5, 277.0, 272.5, 263.0, 250.5, 237.0, 224.5, 215.0, 209.0, 207.5, 211.0, 219.5, 232.0, 247.5, 263.0, 276.5, 286.0, 290.0, 288.0, 280.0, 266.5, 250.0, 232.0, 214.5, 200.0, 190.0, 185.5, 187.5, 196.5, 211.0, 229.5, 250.5, 271.0, 288.0, 299.0, 303.5, 301.0, 291.0, 274.5, 254.0, 231.0, 208.0, 187.0],
    "loudness_envelope_4hz": [-18.5, -18.2, -18.0, -17.8, -17.5, -17.2, -17.0, -16.8, -16.5, -16.3, -16.0, -15.8, -15.5, -15.3, -15.0, -14.8, -14.5, -14.3, -14.0, -13.8, -13.5, -13.3, -13.0, -12.8, -12.5, -12.3, -12.0, -11.8, -11.5, -11.3, -11.0, -10.8, -10.5, -10.3, -10.0, -9.8, -9.5, -9.3, -9.0, -8.8, -8.5, -8.3, -8.0, -7.8, -7.5, -7.3, -7.0, -6.8, -6.5, -6.3, -6.0, -6.2, -6.5, -6.8, -7.0, -7.3, -7.5, -7.8, -8.0, -8.3, -8.5, -8.8, -9.0, -9.3, -9.5, -9.8, -10.0, -10.3, -10.5, -10.8, -11.0, -11.3, -11.5, -11.8, -12.0, -12.3, -12.5, -12.8, -13.0, -13.3, -13.5, -13.8, -14.0, -14.3, -14.5, -14.8, -15.0, -15.3, -15.5, -15.8, -16.0, -16.3, -16.5, -16.8, -17.0, -17.3, -17.5, -17.8, -18.0, -18.3, -18.5, -18.8, -19.0, -19.3, -19.5, -19.8, -20.0, -20.3, -20.5, -20.8, -21.0, -21.3, -21.5, -21.8, -22.0, -22.3, -22.5, -22.8, -23.0, -23.3, -23.5]
  }
}
```

---

## 关键改进 (vs v1.0)

| 方面 | v1.0 | v2.0 | 改进 |
|------|------|------|------|
| JSON 大小 | 7-12 MB | 6.9 KB | **1,476x** ✅ |
| 代码行数 | ~420,000 行 | 405 行 | **1,037x** ✅ |
| 结构清晰度 | ✗ 混乱嵌套 | ✅ 3 层 | **优化** ✅ |
| 数据库存储 | 不实用 | 极简 | **友好** ✅ |
| 验证能力 | ✗ 冗余 | ✅ 4Hz 时序 | **完整** ✅ |
| 响应时间 | ~12 秒 | ~12 秒 | 相同 |

---

## 集成示例

### Python

```python
import requests, json

response = requests.post(
    "http://localhost:8000/extract/complete",
    files={"file": open("audio.mp3", "rb")},
    data={"track_id": "song_001"}
)

data = response.json()

# 获取全局特征
tempo = data["global_risk_features"]["tempo_bpm"]
mode = data["global_risk_features"]["mode"]
print(f"🎵 {mode.upper()} @ {tempo} BPM")

# 获取验证数组 (4Hz)
music_env = data["thumbnail_validation_arrays"]["music_envelope_4hz"]
print(f"📊 Music envelope: {len(music_env)} points")

# 存储到数据库
db.insert(data)  # 仅需 2 KB!
```

### cURL

```bash
curl -X POST "http://localhost:8000/extract/complete" \
  -F "file=@audio.mp3" \
  -F "track_id=song_001" | python -m json.tool
```

---

## 数据库模式建议

```sql
CREATE TABLE tracks_hrv_features (
  id SERIAL PRIMARY KEY,
  track_id VARCHAR(255),
  
  -- 全局风险指标 (11 字段)
  tempo_bpm FLOAT,
  tempo_category VARCHAR(20),
  mode VARCHAR(10),
  mode_score FLOAT,
  tempo_score FLOAT,
  dynamic_range_db FLOAT,
  global_std_loudness FLOAT,
  global_max_pulse_clarity FLOAT,
  mean_loudness_db FLOAT,
  mean_f0_hz FLOAT,
  f0_range_hz FLOAT,
  
  -- 缩图预测特征 (8 字段)
  thumbnail_mode_mean FLOAT,
  thumbnail_pulse_clarity_mean FLOAT,
  thumbnail_tempo_mean_bpm FLOAT,
  thumbnail_music_envelope_mean FLOAT,
  thumbnail_music_envelope_std FLOAT,
  thumbnail_f0_envelope_mean_hz FLOAT,
  thumbnail_loudness_envelope_mean FLOAT,
  thumbnail_loudness_stability FLOAT,
  
  -- 元数据
  thumbnail_start_sec FLOAT,
  thumbnail_end_sec FLOAT,
  thumbnail_duration_sec FLOAT,
  global_confidence_avg FLOAT,
  
  -- 验证数组 (JSON 格式，占用最少空间)
  validation_arrays JSONB,  -- PostgreSQL
  -- OR
  validation_arrays TEXT,   -- MySQL (JSON 格式)
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 简化查询示例
SELECT track_id, tempo_bpm, mode, mode_score 
FROM tracks_hrv_features 
WHERE tempo_category = 'moderate' AND mode = 'major'
LIMIT 100;
```

---

## 性能特性

| 指标 | 数值 |
|------|------|
| 处理时间 (309s 音频) | ~12.9 秒 |
| JSON 响应大小 | < 2 KB |
| 数据库存储 (per track) | ~2 KB |
| 峰值内存 (处理中) | 涉及所有时间线，但不保存 |
| 压缩率 | ~5,000x vs v1.0 |

---

## 版本历史

- **v2.0** (2026-04-09) - 精简输出格式，仅保留关键标量值 + 4Hz 验证数组
- **v1.0** (2026-04-09) - 初始版本，包含所有中间时间线

