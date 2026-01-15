# Essentia API Test Suite (PowerShell)

Simple PowerShell script for testing the Essentia API server.

## Setup

### 1. Start the API Server

```powershell
cd d:\Code\ARCAEA_BACKEND
docker compose up -d
```

### 2. Add Test Audio Files

Place audio files in this directory:
```
test/audio_samples/
```

Supported formats: `.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a`

Example:
```
test/
├── audio_samples/
│   ├── sample1.mp3
│   ├── sample2.wav
│   └── ...
├── results/
│   └── (test results saved here)
└── test_essentia_api.ps1
```

### 3. Run Tests

```powershell
# Navigate to test directory
cd d:\Code\ARCAEA_BACKEND\test

# Run the test script
.\test_essentia_api.ps1
```

Or with custom API URL:
```powershell
.\test_essentia_api.ps1 -ApiUrl "http://localhost:5000"
```

## What the Script Does

1. **Health Check** - Verifies the API is running and accessible
2. **List Operations** - Fetches available extractors and classifiers
3. **Extract Embeddings** - For each audio file:
   - Sends audio to `/extract` endpoint
   - Uses `msd-musicnn-1` extractor
   - Gets embedding vector
4. **Classify Embeddings** - Takes extracted embedding and:
   - Sends to `/classify` endpoint
   - Uses `emomusic-msd-musicnn-2` classifier
   - Gets predictions
5. **Save Results** - Stores all results in JSON format for analysis

## Results

Test results are stored in `test/results/` with timestamps:

```json
{
  "timestamp": "2025-01-15T12:34:56.789123Z",
  "audio_file": "sample1.mp3",
  "api_url": "http://localhost:5000",
  "extraction": {
    "embedding": [0.123, 0.456, ...],
    "shape": [200],
    "operation": "msd-musicnn-1"
  },
  "classification": {
    "predictions": [0.789, 0.234, ...],
    "shape": [2],
    "operation": "emomusic-msd-musicnn-2"
  }
}
```

## Troubleshooting

### Connection refused
- Make sure Docker container is running: `docker compose ps`
- Check logs: `docker compose logs essentia`

### Audio file not found
- Place audio files in `test/audio_samples/`
- Check file extensions are supported (.mp3, .wav, .flac, .ogg, .m4a)

### API returns 404
- Verify operation names match those listed in `/models` endpoint
- Current operations:
  - Extractor: `msd-musicnn-1`
  - Classifier: `emomusic-msd-musicnn-2`

### ModuleNotFoundError in Docker
- Check `Util.py` is copied in Dockerfile
- Rebuild container: `docker compose build --no-cache`
- Run again: `docker compose up -d`

## Script Parameters

The script accepts optional parameters:

```powershell
# Custom API URL (default: http://localhost:5000)
.\test_essentia_api.ps1 -ApiUrl "http://192.168.1.100:5000"

# Custom audio directory (default: .\audio_samples)
.\test_essentia_api.ps1 -AudioDir "D:\my_audio_files"

# Custom results directory (default: .\results)
.\test_essentia_api.ps1 -ResultsDir "D:\test_results"
```

## Next Steps

- Add different audio samples for comprehensive testing
- Analyze results stored in `test/results/`
- Integration with your TS API server
- Modify operations in the script for different extractors/classifiers
