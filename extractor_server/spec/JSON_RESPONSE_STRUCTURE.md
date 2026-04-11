# `/extract/complete` JSON 响应结构树状图

## 完整树状结构

```
{
  ├─ phase_1_global_preprocessing
  │  ├─ peak_normalized: bool
  │  └─ mono_converted: bool
  │
  ├─ phase_2_global_features
  │  ├─ tempo
  │  │  ├─ bpm: float
  │  │  ├─ confidence: float (0-1)
  │  │  ├─ beat_count: int
  │  │  ├─ beat_times: list[float] (秒数)
  │  │  ├─ onset_strength: list[float] (43 Hz) ⭐
  │  │  ├─ onset_times: list[float] (43 Hz) ⭐
  │  │  ├─ max_tempogram: list[float] (43 Hz) ⭐
  │  │  └─ tempogram_times: list[float] (43 Hz) ⭐
  │  │
  │  ├─ mode
  │  │  ├─ mode: str ("major" / "minor")
  │  │  ├─ confidence: float (0-1)
  │  │  ├─ major_strength: float (0-1)
  │  │  ├─ minor_strength: float (0-1)
  │  │  ├─ major_strength_timeline: list[float] (43 Hz) ⭐
  │  │  └─ times: list[float] (43 Hz) ⭐
  │  │
  │  ├─ pulse_clarity
  │  │  ├─ pulse_clarity: float (0-1)
  │  │  ├─ confidence: float (0-1)
  │  │  ├─ pulse_clarity_timeline: list[float] (43 Hz) ⭐
  │  │  └─ tempogram_times: list[float] (43 Hz) ⭐
  │  │
  │  ├─ loudness
  │  │  ├─ loudness_rms: list[float] (10.75 Hz) ⭐
  │  │  ├─ loudness_db: list[float] (10.75 Hz) ⭐
  │  │  ├─ loudness_envelope: list[float] (10.75 Hz) ⭐
  │  │  ├─ loudness_envelope_db: list[float] (10.75 Hz) ⭐
  │  │  ├─ mean_loudness_db: float
  │  │  ├─ peak_loudness_db: float
  │  │  ├─ dynamic_range_db: float
  │  │  └─ times: list[float] (10.75 Hz) ⭐
  │  │
  │  └─ f0_envelope
  │     ├─ f0_values: list[float] (43 Hz, Hz units, 0=无声) ⭐
  │     ├─ f0_confidence: list[float] (43 Hz) ⭐
  │     ├─ f0_voiced: list[0|1] (43 Hz) ⭐
  │     ├─ times: list[float] (43 Hz) ⭐
  │     ├─ mean_f0: float (Hz)
  │     ├─ f0_range
  │     │  ├─ min: float (Hz)
  │     │  └─ max: float (Hz)
  │     └─ voiced_count: int
  │
  ├─ phase_2_5_thumbnail_segmentation
  │  ├─ method: str ("SSM-based (Bartsch & Wakefield 2005)")
  │  ├─ start_time_seconds: float
  │  ├─ end_time_seconds: float
  │  ├─ duration_seconds: float
  │  ├─ start_frame: int (色度特征帧索引)
  │  └─ end_frame: int (色度特征帧索引)
  │
  └─ phase_3_4_medical_grade_output
     ├─ global_risk_features
     │  ├─ mode: str ("major" / "minor")
     │  ├─ mode_score: float (0-1)
     │  ├─ rhythmic_regularity: float (0-1)
     │  ├─ tempo_category: str ("slow" / "moderate" / "fast")
     │  ├─ tempo_bpm: float
     │  ├─ tempo_score: float (0-1)
     │  ├─ dynamic_range_db: float
     │  ├─ dynamic_range_normalized: float (0-1)
     │  ├─ mean_loudness_db: float
     │  ├─ mean_f0_hz: float
     │  └─ f0_range_hz: float
     │
     ├─ thumbnail_prediction_features
     │  ├─ mode_mean: float (0-1)
     │  ├─ pulse_clarity_mean: float (0-1)
     │  ├─ tempo_mean_bpm: float
     │  ├─ music_envelope_mean: float (4 Hz 平均)
     │  ├─ music_envelope_std: float (4 Hz 标准差)
     │  ├─ f0_envelope_mean_hz: float (Hz)
     │  ├─ loudness_envelope_mean: float (4 Hz 平均)
     │  └─ loudness_stability: float (0-1, 1/(1+std))
     │
     ├─ validation_arrays
     │  ├─ music_envelope_4hz: list[float] @ 4 Hz ✅ (120 pts max)
     │  ├─ f0_envelope_4hz: list[float] @ 4 Hz ✅ (120 pts max, 0=无声)
     │  ├─ loudness_envelope_4hz: list[float] @ 4 Hz ✅ (120 pts max)
     │  ├─ sampling_rate_hz: 4.0 (常量)
     │  └─ array_length: int (通常 100-120)
     │
     └─ metadata
        ├─ global_confidence_avg: float (0-1)
        ├─ coherence_with_user_hrv: float | null
        └─ thumbnail_frame_range
           ├─ start: int
           └─ end: int
```

---

## 采样率标注说明

⭐ **标记含义：**
- **43 Hz** = sr / 512 (Hop Length 512)，例：sr=22050 Hz
- **10.75 Hz** = sr / 2048 (Hop Length 2048)，例：sr=22050 Hz
- **✅ 4 Hz** = 固定重采样到 4 Hz (缩图区间)

---

## 数据流向图

```
Audio Input (原始文件)
    ↓
Phase 1: 预处理
    ├→ 峰值正规化
    └→ 单声道转换
    ↓
Phase 2: 并行特征提取 (5 个特征)
    ├→ Tempo (sr/512)
    ├→ Mode (sr/512)
    ├→ Pulse Clarity (sr/512)
    ├→ Loudness (sr/2048)
    └→ F0 Envelope (sr/512)
    ↓
Phase 2.5: 缩图 SSM 分割
    ├→ 色度特征 (sr/512)
    ├→ 1 Hz 下采样 (优化 25,000x)
    └→ 提取 20-30s 代表片段
    ↓
Phase 3: 4Hz 重采样
    ├→ 缩图区间时间轴转换 (0 开始)
    ├→ 立体声重采样 × 3
    │  ├─ 音乐包络线
    │  ├─ F0 轨迹
    │  └─ 响度包络线
    └→ 120 点验证数组
    ↓
Phase 4: 医疗级聚合
    ├→ 全局风险指标 (5-6 项)
    ├→ 缩图预测特征 (8 项)
    ├→ 验证数组 × 3 (@ 4 Hz)
    └→ 元数据 (置信度、帧范围)
    ↓
JSON 响应 (~7-12 MB)
```

---

## 时间轴长度计算

### 对于 309 秒音频 (sr=22050 Hz)

```
Tempo, Mode, Pulse Clarity, F0:
  采样率 = 22050 / 512 = 43 Hz
  帧数 = ceil(309 × 43) = 13,287 帧
  ├─ times: 13,287 个时间戳
  ├─ timeline: 13,287 个数据点
  └─ 总大小: 13,287 × 8 bytes ≈ 0.1 MB

Loudness:
  采样率 = 22050 / 2048 = 10.75 Hz
  帧数 = ceil(309 × 10.75) = 3,322 帧
  ├─ times: 3,322 个时间戳
  ├─ loudness_rms: 3,322 个数据点
  ├─ loudness_db: 3,322 个数据点
  ├─ loudness_envelope: 3,322 个数据点
  └─ 总大小: 3,322 × 4 × 8 bytes ≈ 0.1 MB

F0 voicing (boolean):
  f0_voiced: list[0|1] × 13,287
  └─ 总大小: 13,287 bytes ≈ 13 KB

Validation Arrays @ 4 Hz (缩图):
  缩图时长 ≈ 25-30 秒
  帧数 = ceil(27.5 × 4) ≈ 110 帧
  ├─ music_envelope_4hz: 110 个值
  ├─ f0_envelope_4hz: 110 个值
  └─ loudness_envelope_4hz: 110 个值
  └─ 总大小: 110 × 3 × 8 bytes ≈ 2.6 KB
```

---

## JSON 序列化特殊处理

### NaN/Inf 清理

所有浮点数都经过 `sanitize_json()` 处理：

```python
def sanitize_json(obj):
    if isinstance(obj, float):
        if math.isnan(obj):
            return 0.0  # NaN → 0.0
        elif math.isinf(obj):
            return 0.0  # Inf → 0.0
        return obj
    # 递归处理嵌套结构
```

即使数据源可能产生 NaN（如空数组的 mean），最终 JSON 也会是有效的。

---

## 响应大小预估

| 数据类型 | 数量 | 单位大小 | 总计 |
|---------|------|---------|------|
| Tempo timeline | 13,287 | 8B | 0.1 MB |
| Mode timeline | 13,287 | 8B | 0.1 MB |
| Pulse clarity | 13,287 | 8B | 0.1 MB |
| Loudness ×4 | 3,322 | 8B each | 0.1 MB |
| F0 values | 13,287 | 8B | 0.1 MB |
| F0 confidence | 13,287 | 8B | 0.1 MB |
| F0 voiced | 13,287 | 1B | 13 KB |
| **全曲特征小计** | | | **~0.6 MB** |
| Validation @ 4Hz | 110 | 8B each ×3 | 2.6 KB |
| Metadata | | | <1 KB |
| **总计** | | | **~7-12 MB** |

*实际大小取决于音频时长和特征复杂度*

---

## 快速数据提取示例

### Python 示例

```python
import requests
import json

# 发送请求
response = requests.post(
    "http://localhost:8000/extract/complete",
    files={"file": open("audio.mp3", "rb")},
    data={"thumbnail_duration": 25.0}
)

result = response.json()

# 提取全局特征
global_features = result["phase_3_4_medical_grade_output"]["global_risk_features"]
print(f"Mode: {global_features['mode']}")
print(f"Tempo: {global_features['tempo_bpm']} BPM")
print(f"Dynamic range: {global_features['dynamic_range_db']} dB")

# 提取缩图验证数组
validation = result["phase_3_4_medical_grade_output"]["validation_arrays"]
music_envelope = validation["music_envelope_4hz"]
print(f"Music envelope ({len(music_envelope)} pts @ 4Hz): {music_envelope[:5]}...")

# 提取缩图时间戳
thumbnail = result["phase_2_5_thumbnail_segmentation"]
print(f"Thumbnail: {thumbnail['start_time_seconds']:.1f}s - {thumbnail['end_time_seconds']:.1f}s")

# 访问全曲节奏时间线
tempo_timeline = result["phase_2_global_features"]["tempo"]["max_tempogram"]
tempo_times = result["phase_2_global_features"]["tempo"]["tempogram_times"]
print(f"Tempo timeline: {len(tempo_times)} points @ 43 Hz")
```

### JavaScript 示例

```javascript
// 发送请求
const formData = new FormData();
formData.append("file", audioFile);
formData.append("thumbnail_duration", 25.0);

const response = await fetch("/extract/complete", {
  method: "POST",
  body: formData
});

const result = await response.json();

// 提取特征
const globalFeatures = result.phase_3_4_medical_grade_output.global_risk_features;
console.log(`Mode: ${globalFeatures.mode}`);
console.log(`Tempo: ${globalFeatures.tempo_bpm} BPM`);

// 提取并绘制验证数组
const musicEnvelope = result.phase_3_4_medical_grade_output.validation_arrays.music_envelope_4hz;
// 用图表库 (Chart.js, Plotly 等) 可视化 musicEnvelope
```

---

## 字段映射速查

### 响度相关字段

```
全曲平均响度:
  result["phase_3_4_medical_grade_output"]["global_risk_features"]["mean_loudness_db"]

响度时间线:
  result["phase_2_global_features"]["loudness"]["loudness_envelope"]

响度时间轴:
  result["phase_2_global_features"]["loudness"]["times"]

缩图响度 @ 4Hz:
  result["phase_3_4_medical_grade_output"]["validation_arrays"]["loudness_envelope_4hz"]
```

### 基频相关字段

```
平均基频:
  result["phase_3_4_medical_grade_output"]["global_risk_features"]["mean_f0_hz"]

基频时间线:
  result["phase_2_global_features"]["f0_envelope"]["f0_values"]

基频置信度:
  result["phase_2_global_features"]["f0_envelope"]["f0_confidence"]

有声标记:
  result["phase_2_global_features"]["f0_envelope"]["f0_voiced"]

基频时间轴:
  result["phase_2_global_features"]["f0_envelope"]["times"]

缩图基频 @ 4Hz:
  result["phase_3_4_medical_grade_output"]["validation_arrays"]["f0_envelope_4hz"]
```

### 调式相关字段

```
调式分类 (全曲):
  result["phase_2_global_features"]["mode"]["mode"]

大调强度 (全曲):
  result["phase_2_global_features"]["mode"]["major_strength"]

调式时间线:
  result["phase_2_global_features"]["mode"]["major_strength_timeline"]

缩图平均调式强度:
  result["phase_3_4_medical_grade_output"]["thumbnail_prediction_features"]["mode_mean"]
```

### 节奏相关字段

```
平均 BPM (全曲):
  result["phase_3_4_medical_grade_output"]["global_risk_features"]["tempo_bpm"]

速度分类:
  result["phase_3_4_medical_grade_output"]["global_risk_features"]["tempo_category"]

节拍时间:
  result["phase_2_global_features"]["tempo"]["beat_times"]

速度图时间线:
  result["phase_2_global_features"]["tempo"]["max_tempogram"]

缩图平均 BPM:
  result["phase_3_4_medical_grade_output"]["thumbnail_prediction_features"]["tempo_mean_bpm"]
```

---

## 错误检查清单

处理响应时，应检查：

- [ ] HTTP 状态码 200 OK
- [ ] 所有浮点值都不是 NaN/Inf (已自动清理)
- [ ] 列表长度一致性 (见上面的长度计算)
- [ ] 时间戳单调递增
- [ ] 标准化值在 0-1 范围内 (mode_score, confidence 等)
- [ ] dB 值通常为负 (loudness_db, 相对于 0 dB 峰值)
- [ ] F0 值在 60-400 Hz 范围内 (或 0 表示无声)
- [ ] 缩图时长在 20-30 秒范围内 (默认)

