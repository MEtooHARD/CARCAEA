# 快速参考卡 (Quick Reference Card)

## 一页纸查询表

### API 端点

```
POST /extract/complete
Content-Type: multipart/form-data

参数:
  file: UploadFile (必需)
  thumbnail_duration: float = 25.0
  min_duration: float = 20.0
  max_duration: float = 30.0
```

---

### 采样率速查 (sr = 22050 Hz 示例)

| 特征 | Hop L | 采样率 | 点数/309s | 单位 |
|-----|-------|--------|-----------|------|
| Tempo | 512 | 43 Hz | 13,287 | BPM |
| Mode | 512 | 43 Hz | 13,287 | 0-1 |
| Pulse | 512 | 43 Hz | 13,287 | 0-1 |
| F0 | 512 | 43 Hz | 13,287 | Hz / 0 |
| Loudness | 2048 | 10.75 Hz | 3,322 | dB |
| Validation | - | 4 Hz | ~103-120 | 数值 |

---

### JSON 结构 (3 层视图)

```
Phase 1: Global Preprocessing
  └─ peak_normalized, mono_converted

Phase 2: Global Features (全曲 @ 43Hz 或 10.75Hz)
  ├─ tempo: {bpm, confidence, max_tempogram, ...}
  ├─ mode: {mode, major_strength_timeline, ...}
  ├─ pulse_clarity: {pulse_clarity, ...}
  ├─ loudness: {loudness_envelope, mean_loudness_db, ...}
  └─ f0_envelope: {f0_values, f0_voiced, mean_f0, ...}

Phase 2.5: Thumbnail Segmentation
  └─ start_time_seconds, end_time_seconds, duration_seconds

Phase 3-4: Medical Grade Output (缩图聚合)
  ├─ global_risk_features (11 统计)
  ├─ thumbnail_prediction_features (8 聚合)
  ├─ validation_arrays @ 4Hz (120 点 max)
  └─ metadata (置信度, 帧范围)
```

---

### 时间转换公式

```python
# 秒 ↔ 帧
time_sec = frame_idx × hop_length / sr
frame_idx = int(time_sec × sr / hop_length)

# 例 (Tempo: hop=512, sr=22050)
frame 100 = 100 × 512 / 22050 = 2.31 秒
```

---

### 常见字段

| 字段 | 类型 | 范围 | 说明 |
|------|------|------|------|
| `bpm` | float | >0 | 平均节奏 |
| `confidence` | float | 0-1 | 置信度 |
| `mode` | str | "major"/"minor" | 调式分类 |
| `mode_score` | float | 0-1 | 大调强度 |
| `loudness_db` | float | <0 | 响度 (dB) |
| `f0_values` | list | 60-400, 0=无声 | 基频 (Hz) |
| `f0_voiced` | list | 0/1 | 有声标记 |
| `pulse_clarity` | float | 0-1 | 节奏规律性 |
| `music_envelope_4hz` | list | - | 4Hz 音乐包络 |
| `f0_envelope_4hz` | list | - | 4Hz 基频轨迹 |

---

### 性能基准

```
输入: 309 秒 MP3 @ ~22050 Hz
输出: ~7-12 MB JSON
时间: ~12.9 秒

分解:
  Phase 1: <100ms (预处理)
  Phase 2: ~5-8s (特征提取)
  Phase 2.5: ~80ms (SSM)
  Phase 3-4: ~1-2s (聚合)
```

---

### 数据验证检查

```
□ HTTP 200 OK
□ JSON 格式有效
□ 列表长度一致
□ 时间戳递增
□ BPM ∈ (0, 300)
□ F0 ∈ {0} ∪ [60, 400]
□ dB < 0
□ Confidence ∈ [0, 1]
```

---

### 特殊处理规则

**F0 (基频)**
- 0 值 = 无声段 (unvoiced)
- 计算平均时排除 0: `mean(f0[f0>0])`

**Loudness (响度)**
- 单位: dB (相对于 0 dB 峰值)
- 结果通常为负 (e.g., -18.5 dB)

**Mode (调式)**
- 0-0.5 = 小调倾向
- 0.5-1.0 = 大调倾向

**Validation Arrays**
- 固定 4 Hz 采样
- 仅限缩图区间
- 最多 120 点 (30秒 × 4 Hz)

---

### 关键命令

```bash
# 完整请求
curl -X POST "http://localhost:8000/extract/complete" \
  -F "file=@audio.mp3" \
  -F "thumbnail_duration=25.0" > result.json

# 提取 BPM
jq '.phase_3_4_medical_grade_output.global_risk_features.tempo_bpm' result.json

# 提取验证数组
jq '.phase_3_4_medical_grade_output.validation_arrays.music_envelope_4hz | length' result.json

# 提取缩图时间
jq '.phase_2_5_thumbnail_segmentation' result.json
```

---

### Python 快速集成

```python
import requests

r = requests.post(
    "http://localhost:8000/extract/complete",
    files={"file": open("audio.mp3", "rb")}
)
d = r.json()

# 访问特征
tempo = d['phase_3_4_medical_grade_output']['global_risk_features']['tempo_bpm']
music_env = d['phase_3_4_medical_grade_output']['validation_arrays']['music_envelope_4hz']
```

---

### 常见问题速解

**Q: 为什么 F0 中有 0 值?**
A: 无声段。排除后计算: `f0[f0>0]`

**Q: 时间线长度不一致?**
A: 不同 Hop Length (512 vs 2048)。详见表格。

**Q: 响度为什么是负数?**
A: dB 单位 (相对于 0 dB 峰值)。正常现象。

**Q: 验证数组为什么是 120?**
A: 4 Hz × 30 秒缩图。实际可能更短。

**Q: 如何同步时间轴?**
A: 使用对应的 `times` 字段。不同采样率需分别处理。

---

### 关键参数

```python
# config.py
TEMPO_HOP_LENGTH = 512
LOUDNESS_HOP_LENGTH = 2048
F0_HOP_LENGTH = 512
F0_FMIN = 60
F0_FMAX = 400
LOUDNESS_CUTOFF_FREQ = 2.0
VALIDATION_TARGET_RATE = 4.0  # Hz
```

---

### 文档指引

| 我想... | 看这个 |
|--------|--------|
| 集成 API | SPEC_NAVIGATION.md |
| 理解采样率 | SAMPLING_RATE_REFERENCE.md |
| 解析 JSON | JSON_RESPONSE_STRUCTURE.md |
| 完整规格 | API_SPEC.md |
| 总体概览 | SPEC_SUMMARY.md |

---

### 优化亮点

```
✅ SSM 缩图: 25,000x 加速 (0.08s vs 2000+s)
✅ 并行提取: 5 个特征同时处理
✅ 医疗级: 研究论文支持的算法
✅ 固定 4Hz: 便于对齐和分析
✅ JSON 验证: 自动清理 NaN/Inf
```

---

**版本**: 1.0 | **更新**: 2026-04-09 | **状态**: ✅ Production Ready

