# Essentia Worker API 使用指南

## 概述

Essentia Worker 是一個基於 FastAPI 的音訊特徵提取和模型處理服務。提供通用的模型加載和推理功能，支援任何 TensorFlow 模型。

- **基礎 URL**: `http://localhost:5000`
- **版本**: 2.0.0

---

## API 端點

### 1. 健康檢查

**端點**: `GET /health`

檢查服務狀態和緩存模型數量。

**請求**:
```bash
curl http://localhost:5000/health
```

**響應** (200):
```json
{
  "status": "ok",
  "service": "essentia_worker",
  "queue_size": 0,
  "cached_models": 2
}
```

**欄位說明**:
- `status`: 服務狀態（"ok"）
- `service`: 服務名稱
- `queue_size`: 目前等待隊列中的任務數
- `cached_models`: 已加載到記憶體的模型數

---

### 2. 列出可用模型

**端點**: `GET /models`

掃描並列出 `/app/weights` 目錄中所有可用的 `.pb` 模型檔案。

**請求**:
```bash
curl http://localhost:5000/models
```

**響應** (200):
```json
{
  "models": [
    "audioset-vggish-3",
    "discogs-effnet-bs64-1",
    "emomusic-msd-musicnn-2",
    "genre_discogs400-discogs-maest-30s-pw-ts-1",
    "msd-musicnn-1"
  ],
  "total": 5
}
```

**欄位說明**:
- `models`: 可用模型名稱列表（已排序）
- `total`: 模型總數

---

### 3. 提取音訊特徵（Extraction）

**端點**: `POST /extract`

載入音訊檔案並使用指定的模型提取特徵或 embedding。

**請求**:
```bash
curl -X POST http://localhost:5000/extract \
  -F "file=@audio.mp3" \
  -F "model=audioset-vggish-3"
```

或使用 Python:
```python
import requests

with open('audio.mp3', 'rb') as f:
    files = {'file': f}
    data = {'model': 'audioset-vggish-3'}
    response = requests.post(
        'http://localhost:5000/extract',
        files=files,
        data=data
    )
    print(response.json())
```

**請求參數**:
- `file` (FormData, 必需): 音訊檔案（支援常見格式：MP3, WAV, FLAC 等）
- `model` (FormData, 必需): 模型名稱（見 `/models` 端點）

**響應** (200):
```json
{
  "embedding": [0.123, 0.456, 0.789, ...],
  "shape": [128],
  "model": "audioset-vggish-3",
  "audio_duration": 30.5
}
```

**欄位說明**:
- `embedding`: 提取的特徵向量（float array）
- `shape`: 特徵向量的維度
- `model`: 使用的模型名稱
- `audio_duration`: 音訊時長（秒）

**錯誤碼**:
- `400`: 上傳檔案為空
- `404`: 模型檔案不存在
- `500`: 模型載入或推理失敗

---

### 4. 通用模型處理

**端點**: `POST /process`

對輸入的特徵向量進行模型推理。適用於分類、回歸等任何 TensorFlow 2D 模型。

**請求**:
```bash
curl -X POST http://localhost:5000/process \
  -H "Content-Type: application/json" \
  -d '{
    "data": [0.123, 0.456, 0.789, ...],
    "model": "genre_discogs400-discogs-maest-30s-pw-ts-1"
  }'
```

或使用 Python:
```python
import requests

response = requests.post(
    'http://localhost:5000/process',
    json={
        'data': [0.123, 0.456, 0.789],
        'model': 'genre_discogs400-discogs-maest-30s-pw-ts-1'
    }
)
print(response.json())
```

**請求參數** (JSON Body):
- `data` (array, 必需): 輸入特徵向量（float array）
- `model` (string, 必需): 模型名稱

**響應** (200):
```json
{
  "output": [0.1, 0.2, 0.3, 0.4],
  "shape": [4],
  "model": "genre_discogs400-discogs-maest-30s-pw-ts-1"
}
```

**欄位說明**:
- `output`: 模型輸出向量（float array）
- `shape`: 輸出向量的維度
- `model`: 使用的模型名稱

**錯誤碼**:
- `404`: 模型檔案不存在
- `500`: 模型載入或推理失敗

---

## 典型使用流程

### 單階段：直接特徵提取
```
音訊檔案 → POST /extract → embedding
```

### 兩階段：特徵提取 + 分類
```
音訊檔案 → POST /extract → embedding → POST /process → 分類結果
```

### 範例（Python）
```python
import requests

# 1. 列出可用模型
models_response = requests.get('http://localhost:5000/models')
print("Available models:", models_response.json()['models'])

# 2. 提取特徵
with open('music.mp3', 'rb') as f:
    extract_response = requests.post(
        'http://localhost:5000/extract',
        files={'file': f},
        data={'model': 'audioset-vggish-3'}
    )
embedding = extract_response.json()['embedding']
print(f"Extracted embedding shape: {extract_response.json()['shape']}")

# 3. 分類
classify_response = requests.post(
    'http://localhost:5000/process',
    json={
        'data': embedding,
        'model': 'genre_discogs400-discogs-maest-30s-pw-ts-1'
    }
)
predictions = classify_response.json()['output']
print(f"Classification result: {predictions}")
```

---

## 性能注意事項

### 隊列處理
- 所有 TensorFlow 推理任務都在內部隊列中**順序執行**
- 這是為了避免 TensorFlow 全局記憶體限制
- `/health` 端點的 `queue_size` 可用於監控隊列狀態

### 模型快取
- 首次載入模型時會緩存到記憶體
- 後續請求相同模型會直接使用快取（更快）
- 快取的模型數量在 `/health` 中顯示

### 採樣率
- `/extract` 端點固定使用 **16kHz** 採樣率
- 音訊會自動重新採樣

---

## 錯誤處理

所有錯誤響應都遵循以下格式：

```json
{
  "detail": "Error message describing what went wrong"
}
```

常見錯誤：
- `FileNotFoundError`: 模型檔案不存在
- `ValueError`: 輸入格式不正確
- `HTTPException 500`: 模型推理失敗

---

## 部署配置

### 環境變數
- 模型權重目錄: `/app/weights`（在容器中）
- 服務埠: `5000`
- 主機: `0.0.0.0`（接受所有網絡請求）

### Docker 使用
```bash
# 在 docker-compose.yml 中
services:
  essentia:
    build: ./essentia
    ports:
      - "5000:5000"
    volumes:
      - ./essentia/weights:/app/weights
```

---

## 限制和已知問題

1. **TensorFlow 2D 模型限制**: 目前使用 `TensorflowPredict2D`，僅支持二維輸入
2. **單進程執行**: 推理任務順序執行，可能成為高流量瓶頸
3. **輸出層自動檢測**: 不再從 metadata 讀取，依賴 TensorFlow 模型的默認輸出層

---

## 常見問題

**Q: 如何新增新模型？**
A: 將 `.pb` 檔案放入 `/app/weights` 目錄，重啟服務。`/models` 端點會自動掃描。

**Q: 支援哪些音訊格式？**
A: 取決於系統安裝的編碼器（通常支援 MP3, WAV, FLAC, OGG 等）。

**Q: 為什麼說"TensorFlow 全局記憶體限制"？**
A: TensorFlow 在第一次初始化時會分配固定比例的 GPU/CPU 記憶體。多個模型同時執行可能超出限制，因此使用隊列強制順序執行。

**Q: 可以並行處理多個請求嗎？**
A: 可以，但它們會在隊列中排隊。下一個請求會在前一個完成後開始。

---

## API 總結表

| 端點 | 方法 | 功能 | 主要參數 |
|------|------|------|---------|
| `/health` | GET | 檢查服務狀態 | - |
| `/models` | GET | 列出可用模型 | - |
| `/extract` | POST | 提取音訊特徵 | `file`, `model` |
| `/process` | POST | 模型推理 | `data`, `model` |

---

**上次更新**: 2026-01-14  
**版本**: 2.0.0
