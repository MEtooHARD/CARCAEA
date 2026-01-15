# ARCAEA API Endpoints

## Base URL
```
http://3.107.5.231:3001
```

---

## Endpoints

### 1. Health Check
**GET** `/health`

Check if the server is running.

**Response:**
```json
{
  "status": "ok"
}
```

---

### 2. Search Songs by Valence & Arousal
**GET** `/songs/search/by_va`

Find songs based on emotional mood (valence) and energy level (arousal).

**Query Parameters:**
- `valence` (required): number between 1-9 (1=sad, 9=happy)
- `arousal` (required): number between 1-9 (1=calm, 9=energetic)
- `tolerance` (optional): number between 0-5 (default: 0.5) - search radius

**Example:**
```
GET /songs/search/by_va?valence=7&arousal=8&tolerance=1
```

**Success Response:**
```json
{
  "songs": [
    {
      "id": "abc123...",
      "valence": 7.2,
      "arousal": 8.1
    },
    {
      "id": "def456...",
      "valence": 6.8,
      "arousal": 7.9
    }
  ]
}
```

**Error Response:**
```json
{
  "error": "error message"
}
```
