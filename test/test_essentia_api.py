#!/usr/bin/env python3
"""
Test script for Essentia API Server
Tests both /extract and /classify endpoints with sample audio files
Results are stored in JSON format for analysis
"""

import requests
import json
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any


# Configuration
API_BASE_URL = "http://localhost:5000"
TEST_DIR = Path(__file__).parent
RESULTS_DIR = TEST_DIR / "results"
AUDIO_DIR = TEST_DIR / "audio_samples"


def ensure_directories() -> None:
    """Create necessary directories if they don't exist."""
    RESULTS_DIR.mkdir(exist_ok=True)
    AUDIO_DIR.mkdir(exist_ok=True)
    print(f"✓ Results directory: {RESULTS_DIR}")
    print(f"✓ Audio directory: {AUDIO_DIR}")


def health_check() -> bool:
    """Check if the API server is running."""
    try:
        response = requests.get(f"{API_BASE_URL}/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✓ API is healthy")
            print(f"  - Status: {data.get('status')}")
            print(f"  - Service: {data.get('service')}")
            print(f"  - Extractors: {data.get('extractors')}")
            print(f"  - Classifiers: {data.get('classifiers')}")
            return True
        else:
            print(f"✗ API returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print(f"✗ Cannot connect to API at {API_BASE_URL}")
        print(f"  Make sure the container is running: docker compose up")
        return False
    except Exception as e:
        print(f"✗ Error checking health: {e}")
        return False


def list_operations() -> Dict[str, Any]:
    """Fetch available operations from the API."""
    try:
        response = requests.get(f"{API_BASE_URL}/models", timeout=5)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"✗ Failed to list operations: {e}")
        return {"extractors": [], "classifiers": []}


def test_extract(audio_file: Path, operation: str) -> Optional[Dict[str, Any]]:
    """
    Test the /extract endpoint with an audio file.
    
    Args:
        audio_file: Path to audio file
        operation: Extractor operation name
        
    Returns:
        Response JSON or None if failed
    """
    if not audio_file.exists():
        print(f"✗ Audio file not found: {audio_file}")
        return None
    
    try:
        print(f"\n📊 Testing extraction: {audio_file.name}")
        print(f"   Operation: {operation}")
        
        with open(audio_file, "rb") as f:
            files = {"file": (audio_file.name, f, "audio/mpeg")}
            data = {"operation": operation}
            
            response = requests.post(
                f"{API_BASE_URL}/extract",
                files=files,
                data=data,
                timeout=30
            )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✓ Extraction successful")
            print(f"  - Embedding shape: {result.get('shape')}")
            print(f"  - Embedding length: {len(result.get('embedding', []))}")
            return result
        else:
            print(f"✗ Extraction failed with status {response.status_code}")
            print(f"  Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"✗ Extraction error: {e}")
        return None


def test_classify(embedding: list, operation: str) -> Optional[Dict[str, Any]]:
    """
    Test the /classify endpoint with an embedding.
    
    Args:
        embedding: Embedding vector (float array)
        operation: Classifier operation name
        
    Returns:
        Response JSON or None if failed
    """
    try:
        print(f"\n📊 Testing classification")
        print(f"   Operation: {operation}")
        print(f"   Input embedding length: {len(embedding)}")
        
        payload = {
            "embedding": embedding,
            "operation": operation
        }
        
        response = requests.post(
            f"{API_BASE_URL}/classify",
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✓ Classification successful")
            print(f"  - Predictions shape: {result.get('shape')}")
            print(f"  - Predictions length: {len(result.get('predictions', []))}")
            return result
        else:
            print(f"✗ Classification failed with status {response.status_code}")
            print(f"  Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"✗ Classification error: {e}")
        return None


def save_results(test_name: str, results: Dict[str, Any]) -> None:
    """Save test results to a JSON file."""
    timestamp = datetime.now().isoformat()
    results_with_metadata = {
        "timestamp": timestamp,
        "test_name": test_name,
        "api_url": API_BASE_URL,
        **results
    }
    
    filename = RESULTS_DIR / f"{test_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    
    try:
        with open(filename, "w") as f:
            json.dump(results_with_metadata, f, indent=2)
        print(f"\n💾 Results saved: {filename}")
    except Exception as e:
        print(f"\n✗ Failed to save results: {e}")


def run_end_to_end_test(audio_file: Path) -> None:
    """
    Run a complete test: extract embedding, then classify it.
    
    Args:
        audio_file: Path to audio file
    """
    print(f"\n{'='*60}")
    print(f"END-TO-END TEST: {audio_file.name}")
    print(f"{'='*60}")
    
    # Extract
    extraction_result = test_extract(audio_file, "msd-musicnn-1")
    if not extraction_result:
        print("✗ Extraction failed, skipping classification")
        return
    
    embedding = extraction_result.get("embedding", [])
    
    # Classify
    classification_result = test_classify(embedding, "emomusic-msd-musicnn-2")
    
    # Save combined results
    combined_results = {
        "extraction": extraction_result,
        "classification": classification_result
    }
    
    test_name = audio_file.stem
    save_results(test_name, combined_results)


def main():
    """Main test runner."""
    print("="*60)
    print("ESSENTIA API TEST SUITE")
    print("="*60)
    
    # Setup
    ensure_directories()
    
    # Health check
    print(f"\n🔍 Checking API health...")
    if not health_check():
        print("\n✗ API is not available. Please start it with:")
        print("  docker compose up -d")
        sys.exit(1)
    
    # List operations
    print(f"\n📋 Available operations:")
    ops = list_operations()
    print(f"  Extractors: {ops.get('extractors', [])}")
    print(f"  Classifiers: {ops.get('classifiers', [])}")
    
    # Find audio files
    audio_files = list(AUDIO_DIR.glob("*"))
    if not audio_files:
        print(f"\n⚠️  No audio files found in {AUDIO_DIR}")
        print("   Place .mp3, .wav, or other audio files there to test")
        print("   Example: test/audio_samples/sample.mp3")
        return
    
    print(f"\n🎵 Found {len(audio_files)} audio file(s)")
    
    # Run tests
    for audio_file in audio_files:
        if audio_file.suffix.lower() in [".mp3", ".wav", ".flac", ".ogg", ".m4a"]:
            run_end_to_end_test(audio_file)
        else:
            print(f"\n⚠️  Skipping unsupported format: {audio_file.name}")
    
    print(f"\n✓ Testing complete!")
    print(f"  Results stored in: {RESULTS_DIR}")


if __name__ == "__main__":
    main()
