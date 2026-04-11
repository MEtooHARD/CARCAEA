# 提取器 API 规格文档导航

完整的医疗级 HRV 特征提取 API 规格文档集合。

---

## 📚 文档结构

### 1. **API_SPEC.md** ⭐ 开始这里
**适用于：** API 使用者、集成开发者

包含内容：
- ✅ 完整的 `/extract/complete` 端点规格
- ✅ 四阶段管道详细说明
- ✅ 所有返回字段的类型与范围
- ✅ 完整的 JSON 响应示例
- ✅ 采样率汇总表
- ✅ 性能基准数据

**快速链接：**
- [端点参数](API_SPEC.md#端点参数)
- [Phase 1: 预处理](API_SPEC.md#phase-1-全曲全局预处理)
- [Phase 2: 特征提取](API_SPEC.md#phase-2-全曲特征提取)
  - [2.1 Tempo](API_SPEC.md#21-tempo-节奏bpm)
  - [2.2 Mode](API_SPEC.md#22-mode-调式分析)
  - [2.3 Pulse Clarity](API_SPEC.md#23-pulse-clarity-脉动清晰度)
  - [2.4 Loudness](API_SPEC.md#24-loudness-响度与音乐包络线)
  - [2.5 F0 Envelope](API_SPEC.md#25-f0-envelope-基频包络线音高轨迹)
- [Phase 2.5: 缩图分割](API_SPEC.md#phase-25-基于-ssm-的缩图分割)
- [Phase 3-4: 医疗级聚合](API_SPEC.md#phase-3-4-医疗级-hrv-聚合输出)
- [采样率速查表](API_SPEC.md#采样率速查表)

---

### 2. **SAMPLING_RATE_REFERENCE.md** 🔍 深入了解采样率
**适用于：** 时间对齐工作、音频处理专家

包含内容：
- ✅ 所有特征提取器的 Hop Length 配置
- ✅ 每个特征的精确采样率计算
- ✅ 具体数值示例 (sr=22050 Hz)
- ✅ 帧与秒数互转公式
- ✅ 响度与基频特殊处理
- ✅ 时间轴对齐关键点
- ✅ 验证数据一致性检查清单

**快速公式：**
```
秒数 = 帧索引 × Hop_Length / sr
帧索引 = 秒数 × sr / Hop_Length
```

**常见采样率 (sr=22050 Hz)：**

| 特征 | 采样率 | 时间分辨率 |
|------|--------|---------|
| Tempo/Mode/Pulse/F0 | 43 Hz | ~23 ms |
| Loudness | 10.75 Hz | ~93 ms |
| Validation @ 4Hz | 4 Hz | 250 ms |

---

### 3. **JSON_RESPONSE_STRUCTURE.md** 🌳 JSON 结构可视化
**适用于：** 前端开发、JSON 映射、数据集成

包含内容：
- ✅ 完整的树状 JSON 结构
- ✅ 采样率标注 (⭐ ✅ 符号)
- ✅ 数据流向图
- ✅ 时间轴长度计算
- ✅ 快速数据提取示例 (Python/JS)
- ✅ 字段映射速查表
- ✅ 错误检查清单

**树状结构快速查看：**
```
{
  phase_1_global_preprocessing
  phase_2_global_features
    ├─ tempo (43 Hz ⭐)
    ├─ mode (43 Hz ⭐)
    ├─ pulse_clarity (43 Hz ⭐)
    ├─ loudness (10.75 Hz ⭐)
    └─ f0_envelope (43 Hz ⭐)
  phase_2_5_thumbnail_segmentation
  phase_3_4_medical_grade_output
    ├─ global_risk_features
    ├─ thumbnail_prediction_features
    ├─ validation_arrays (4 Hz ✅)
    └─ metadata
}
```

---

## 🎯 使用场景快速导航

### 场景 1: "我需要集成这个 API"
**推荐阅读顺序：**
1. [API_SPEC.md - 端点参数](API_SPEC.md#端点参数)
2. [API_SPEC.md - 完整响应格式](API_SPEC.md#完整响应格式)
3. [JSON_RESPONSE_STRUCTURE.md - 快速数据提取](JSON_RESPONSE_STRUCTURE.md#快速数据提取示例)
4. [JSON_RESPONSE_STRUCTURE.md - 字段映射](JSON_RESPONSE_STRUCTURE.md#字段映射速查)

**关键概念：**
- 四个 Phase 的含义
- Phase 3-4 输出的三个部分 (global, thumbnail, validation)
- 采样率不一致的原因

---

### 场景 2: "我需要处理时间轴"
**推荐阅读顺序：**
1. [SAMPLING_RATE_REFERENCE.md - 特征提取器采样率矩阵](SAMPLING_RATE_REFERENCE.md#1-特征提取器采样率矩阵)
2. [SAMPLING_RATE_REFERENCE.md - 帧与秒数互转](SAMPLING_RATE_REFERENCE.md#4-帧与秒数互转公式)
3. [SAMPLING_RATE_REFERENCE.md - 时间轴对齐](SAMPLING_RATE_REFERENCE.md#8-时间轴对齐关键点)
4. [JSON_RESPONSE_STRUCTURE.md - 时间轴长度计算](JSON_RESPONSE_STRUCTURE.md#时间轴长度计算)

**关键公式：**
```python
# 转换帧到秒数
time_sec = frame_index * hop_length / sr

# 转换秒数到帧
frame_index = int(time_sec * sr / hop_length)

# 例子
# Tempo 第 100 帧 @ sr=22050 Hz
seconds = 100 * 512 / 22050 = 2.31 秒
```

---

### 场景 3: "我需要理解每个特征"
**推荐阅读顺序：**
1. [API_SPEC.md - Phase 2: 全曲特征提取](API_SPEC.md#phase-2-全曲特征提取)
   - 逐个特征阅读
2. [SAMPLING_RATE_REFERENCE.md - 基频处理特殊情况](SAMPLING_RATE_REFERENCE.md#6-基频-f0-处理特殊情况)
3. [SAMPLING_RATE_REFERENCE.md - 响度计算细节](SAMPLING_RATE_REFERENCE.md#5-响度计算细节)

**关键要点：**
- F0 = 基频，0 值 = 无声段
- Loudness = RMS 能量，已转换为 dB
- Mode = 调式分类 (大调/小调)
- Tempo = BPM，使用速度图估计
- Pulse Clarity = 节奏规律性指标

---

### 场景 4: "我需要数据验证"
**推荐阅读：**
1. [JSON_RESPONSE_STRUCTURE.md - 错误检查清单](JSON_RESPONSE_STRUCTURE.md#错误检查清单)
2. [SAMPLING_RATE_REFERENCE.md - 验证数据一致性检查](SAMPLING_RATE_REFERENCE.md#11-验证数据一致性检查清单)
3. [SAMPLING_RATE_REFERENCE.md - 常见时间计算示例](SAMPLING_RATE_REFERENCE.md#10-常见时间计算示例)

**必检项目：**
- [ ] HTTP 状态码 200 OK
- [ ] 列表长度一致性
- [ ] 时间戳单调递增
- [ ] F0 值在 60-400 Hz (或 0)
- [ ] 响度为负数 dB

---

## 📊 核心数据指标一览

### 性能基准

| 指标 | 数值 |
|------|------|
| 单个 309s 音频处理时间 | ~12.9 秒 |
| SSM 计算时间 (vs 原始) | 0.08s vs 2000+ 秒 (**25,000x** 加速) |
| 输出 JSON 大小 | ~7-12 MB |
| 缩图默认时长 | 20-30 秒 |
| 验证数组采样率 | 4 Hz (固定) |

### 采样率一览表

| 特征 | sr=22050 Hz | sr=44100 Hz |
|------|-----------|-----------|
| Tempo/Mode/Pulse/F0 | 43 Hz | 86 Hz |
| Loudness | 10.75 Hz | 21.5 Hz |
| Validation @ 4Hz | 4 Hz | 4 Hz |

---

## 🔑 关键概念速览

### 四阶段管道

```
Phase 1: 预处理
  → 峰值正规化 + 单声道转换

Phase 2: 特征提取 (并行)
  → Tempo, Mode, Pulse Clarity, Loudness, F0

Phase 2.5: 缩图分割
  → SSM 自相似矩阵 (1 Hz 优化)
  → 提取 20-30 秒代表片段

Phase 3-4: 聚合输出
  → 全局风险指标 × 11
  → 缩图预测特征 × 8
  → 验证数组 × 3 @ 4 Hz
  → 元数据
```

### 采样率倍增关系

```
原始采样率: sr (22050 Hz 常见)

特征采样率计算:
  Tempo/Mode/Pulse/F0:  sr / 512 = 43 Hz (例)
  Loudness:            sr / 2048 = 10.75 Hz (例)
  Validation:          4 Hz (固定, 经过 Resampler)
```

### 关键优化：1 Hz 缩图下采样

```
原始:
  色度特征 @ 43 Hz
  309 秒 => 13,287 帧
  SSM 计算: O(n²) = 177M 元素
  耗时: 2000+ 秒

优化后:
  1 Hz 下采样 (平均池化)
  309 秒 => 309 帧
  SSM 计算: O(n²) = 95K 元素
  耗时: 0.08 秒
  ✅ 25,000x 加速
```

---

## 🚀 快速开始示例

### Python 集成

```python
import requests

# 1. 发送请求
with open("audio.mp3", "rb") as f:
    response = requests.post(
        "http://localhost:8000/extract/complete",
        files={"file": f},
        data={"thumbnail_duration": 25.0}
    )

# 2. 解析响应
result = response.json()

# 3. 提取关键特征
global_features = result["phase_3_4_medical_grade_output"]["global_risk_features"]
print(f"🎵 Mode: {global_features['mode']}")
print(f"⏱️  Tempo: {global_features['tempo_bpm']} BPM")

# 4. 获取验证数组
validation = result["phase_3_4_medical_grade_output"]["validation_arrays"]
music_env = validation["music_envelope_4hz"]  # 120 pts @ 4 Hz
print(f"📊 Music envelope: {len(music_env)} points")
```

### cURL 命令

```bash
curl -X POST "http://localhost:8000/extract/complete" \
  -F "file=@audio.mp3" \
  -F "thumbnail_duration=25.0" | python -m json.tool | less
```

---

## 📋 配置文件参考

### config.py 采样率配置

```python
# Tempo
TEMPO_HOP_LENGTH = 512      # sr / 512 = 43 Hz @ sr=22050
TEMPO_START_BPM = 120

# Loudness
LOUDNESS_HOP_LENGTH = 2048  # sr / 2048 = 10.75 Hz @ sr=22050
LOUDNESS_FILTER_ORDER = 5
LOUDNESS_CUTOFF_FREQ = 2.0

# F0
F0_HOP_LENGTH = 512         # sr / 512 = 43 Hz @ sr=22050
F0_FMIN = 60               # 最小基频
F0_FMAX = 400              # 最大基频

# Validation
VALIDATION_TARGET_RATE = 4.0  # Hz (固定)
```

---

## 📖 参考论文

1. **Bartsch & Wakefield 2005**
   - "To CATCH a Chorus: Using Chroma-Based Representations for Audio Thumbnailing"
   - SSM 缩图提取算法基础

2. **Trochidis et al.**
   - HRV 预测系数模型

3. **Bernardi et al.**
   - 音乐调式与心率变异性研究

4. **Lavezzo et al.**
   - 收敛交叉映射 (Convergent Cross-Mapping)

---

## ❓ 常见问题速查

### Q: 为什么有些时间线采样率不同？
**A:** [SAMPLING_RATE_REFERENCE.md - 时间轴对齐](SAMPLING_RATE_REFERENCE.md#8-时间轴对齐关键点)

### Q: 如何转换帧索引为秒数？
**A:** [SAMPLING_RATE_REFERENCE.md - 帧与秒数互转](SAMPLING_RATE_REFERENCE.md#4-帧与秒数互转公式)

### Q: F0 中为什么有 0 值？
**A:** [API_SPEC.md - F0 特殊处理](API_SPEC.md#25-f0-envelope-基频包络线音高轨迹)

### Q: 响度为什么是负数 dB？
**A:** [SAMPLING_RATE_REFERENCE.md - 响度计算](SAMPLING_RATE_REFERENCE.md#5-响度计算细节)

### Q: 验证数组为什么是 120 个点？
**A:** [JSON_RESPONSE_STRUCTURE.md - 时间轴长度](JSON_RESPONSE_STRUCTURE.md#时间轴长度计算)

---

## 📞 支持

如有问题或发现未记录的行为，请参考 [API_SPEC.md](API_SPEC.md) 中的完整字段说明或相应的提取器源代码。

**关键文件：**
- `extractors/master_feature_extractor.py` - 四阶段协调器
- `extractors/statistical_aggregator.py` - 特征聚合逻辑
- `routes.py` - HTTP 端点实现

---

**最后更新：** 2026-04-09
**当前版本：** v1.0 (完全规格化)
