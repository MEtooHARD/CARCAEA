# Essentia API Documentation

## Overview
Two-stage audio processing API: **extraction** (audio → embedding) and **classification** (embedding → labels), with a bonus **regression** endpoint for emotion prediction.

---

## Endpoint Patterns

### Health & Discovery

#### `GET /health`
**Purpose:** Health check and queue status  
**Response:**
```json
{
  "status": "ok",
  "service": "essentia_worker",
  "queue_size": 0,
  "extractors": 1,
  "classifiers": 1
}
```

#### `GET /models`
**Purpose:** List available operations  
**Response:**
```json
{
  "extractors": ["msd-musicnn-1"],
  "classifiers": ["emomusic-msd-musicnn-2"]
}
```

---

### Audio Processing

#### `POST /extract`
**Purpose:** Extract audio embedding  
**Content-Type:** `multipart/form-data`

**Parameters:**
- `file` (file): Audio file (required)
- `operation` (string): Extractor name, e.g., `"msd-musicnn-1"` (required, form field)

**Response:**
```json
{
  "embedding": [0.123, 0.456, ...],
  "shape": [128],
  "operation": "msd-musicnn-1"
}
```

---

#### `POST /classify`
**Purpose:** Classify an embedding  
**Content-Type:** `application/json`

**Body:**
```json
{
  "embedding": [0.123, 0.456, ...],
  "operation": "emomusic-msd-musicnn-2"
}
```

**Response:**
```json
{
  "predictions": [0.8, 0.2, ...],
  "shape": [2],
  "operation": "emomusic-msd-musicnn-2"
}
```

---

### Emotion Prediction

#### `POST /regress`
**Purpose:** Predict valence and arousal from audio (Griffiths 2021 model)  
**Content-Type:** `multipart/form-data`

**Parameters:**
- `file` (file): Audio file (required)

**Response:**
```json
{
  "valence": 0.45,
  "arousal": 0.72,
  "emotion_quadrant": "Excited/Happy",
  "features": {
    "mean_rms_energy": 0.123,
    "std_rms_energy": 0.045,
    "mean_spectral_centroid": 2500.5,
    "mean_spectral_rolloff": 4000.2,
    "mean_spectral_spread": 1200.3
  },
  "model": "griffiths-2021"
}
```

---

## Common Features

- **Async Queue Processing:** All requests are serialized through a queue to handle TensorFlow's global memory constraints
- **Error Handling:** Returns `HTTPException` with status codes (400, 404, 422, 500)
- **Logging:** Detailed request/task logging for debugging

## Emotion Quadrants (Valence-Arousal Model)
- **Positive Valence + High Arousal:** Excited/Happy
- **Negative Valence + High Arousal:** Angry/Tense
- **Negative Valence + Low Arousal:** Sad/Depressed
- **Positive Valence + Low Arousal:** Calm/Relaxed
