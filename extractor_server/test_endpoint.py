#!/usr/bin/env python3
"""
Test script for the /extract/complete endpoint
Starts the server, tests with all audio files from test_src, and saves results to test_res
"""

import subprocess
import time
import json
import logging
import sys
from pathlib import Path
from typing import Optional
import requests
import signal
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
WORKSPACE_DIR = Path(__file__).parent
TEST_SRC_DIR = WORKSPACE_DIR / "test_src"
TEST_RES_DIR = WORKSPACE_DIR / "test_res"
SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8000
SERVER_URL = f"http://{SERVER_HOST}:{SERVER_PORT}"
ENDPOINT = "/extract/complete"
MAX_RETRIES = 10
RETRY_DELAY = 2

# Ensure test_res directory exists
TEST_RES_DIR.mkdir(exist_ok=True)


def wait_for_server(max_retries: int = MAX_RETRIES, retry_delay: int = RETRY_DELAY) -> bool:
    """Wait for the server to be ready"""
    health_url = f"{SERVER_URL}/health"
    for attempt in range(max_retries):
        try:
            response = requests.get(health_url, timeout=5)
            if response.status_code == 200:
                logger.info("✓ Server is ready")
                return True
        except requests.exceptions.RequestException:
            if attempt < max_retries - 1:
                logger.info(
                    f"⏳ Waiting for server... (attempt {attempt + 1}/{max_retries})")
                time.sleep(retry_delay)

    logger.error("✗ Server failed to start within timeout")
    return False


def start_server() -> Optional[subprocess.Popen]:
    """Start the FastAPI server"""
    logger.info(f"🚀 Starting server on {SERVER_URL}...")
    try:
        # Start uvicorn server
        process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app:app", "--host",
                SERVER_HOST, "--port", str(SERVER_PORT)],
            cwd=WORKSPACE_DIR,
            # stdout=subprocess.PIPE,
            # stderr=subprocess.PIPE,
            preexec_fn=os.setsid  # Create a new process group
        )
        return process
    except Exception as e:
        logger.error(f"✗ Failed to start server: {e}")
        return None


def test_endpoint(file_path: Path) -> Optional[dict]:
    """Test the /extract/complete endpoint with an audio file"""
    url = f"{SERVER_URL}{ENDPOINT}"

    try:
        logger.info(f"📤 Testing: {file_path.name}")

        # Prepare multipart form data
        with open(file_path, 'rb') as f:
            files = {'file': (file_path.name, f, 'audio/mpeg')}
            data = {
                'thumbnail_duration': 25.0,
                'min_duration': 20.0,
                'max_duration': 30.0,
            }

            response = requests.post(url, files=files, data=data, timeout=180)

        if response.status_code == 200:
            result = response.json()
            logger.info(
                f"✓ {file_path.name}: Success (Status: {response.status_code})")
            return result
        else:
            logger.error(
                f"✗ {file_path.name}: Failed (Status: {response.status_code})")
            logger.error(f"  Response: {response.text[:200]}")
            return None

    except requests.exceptions.Timeout:
        logger.error(f"✗ {file_path.name}: Request timeout (120s)")
        return None
    except Exception as e:
        logger.error(f"✗ {file_path.name}: Error - {e}")
        return None


def save_result(file_path: Path, result: dict) -> None:
    """Save result JSON to test_res directory"""
    result_file = TEST_RES_DIR / f"{file_path.stem}.json"
    try:
        with open(result_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        logger.info(f"💾 Saved: {result_file.name}")
    except Exception as e:
        logger.error(f"✗ Failed to save {result_file.name}: {e}")


def main():
    """Main test flow"""
    server_process = None

    try:
        # Start server
        server_process = start_server()
        if not server_process:
            sys.exit(1)

        # Wait for server to be ready
        if not wait_for_server():
            sys.exit(1)

        # Get all audio files from test_src
        audio_files = sorted(TEST_SRC_DIR.glob("*"))
        audio_files = [f for f in audio_files if f.is_file() and f.suffix.lower() in {
            '.mp3', '.wav', '.flac', '.ogg', '.m4a'}]

        if not audio_files:
            logger.warning(f"⚠ No audio files found in {TEST_SRC_DIR}")
            return

        logger.info(f"📁 Found {len(audio_files)} audio files to test")
        logger.info("=" * 60)

        # Test each file
        successful = 0
        failed = 0

        for audio_file in audio_files:
            result = test_endpoint(audio_file)
            if result:
                save_result(audio_file, result)
                successful += 1
            else:
                failed += 1

        logger.info("=" * 60)
        logger.info(
            f"✅ Test complete: {successful} successful, {failed} failed")

    except KeyboardInterrupt:
        logger.info("\n⚠ Test interrupted by user")
    except Exception as e:
        logger.error(f"✗ Unexpected error: {e}")
    finally:
        # Stop server
        if server_process:
            logger.info("🛑 Stopping server...")
            try:
                # Kill the entire process group
                os.killpg(os.getpgid(server_process.pid), signal.SIGTERM)
                server_process.wait(timeout=5)
                logger.info("✓ Server stopped")
            except:
                logger.info("⚠ Force killing server...")
                server_process.kill()


if __name__ == "__main__":
    main()
