#!/usr/bin/env python3
"""
快速测试脚本
用于测试各个特征提取端点
"""

from typing import Dict, Optional
import requests
import sys
from pathlib import Path

# API 基础 URL
BASE_URL: str = "http://localhost:8000"
ENDPOINTS: Dict[str, str] = {
    "pulse-clarity": "/extract/pulse-clarity",
    "mode": "/extract/mode",
    "tempo": "/extract/tempo",
    "loudness": "/extract/loudness",
    "f0-envelope": "/extract/f0-envelope",
}


def test_health() -> bool:
    """测试健康检查"""
    print("\n=== 测试健康检查 ===")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"状态码: {response.status_code}")
        print(f"响应: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"❌ 失败: {e}")
        return False


def test_feature_extraction(feature_name: str, audio_file_path: str) -> bool:
    """测试特征提取"""
    print(f"\n=== 测试 {feature_name} 特征提取 ===")

    if not Path(audio_file_path).exists():
        print(f"❌ 音频文件不存在: {audio_file_path}")
        return False

    endpoint = ENDPOINTS[feature_name]
    url = f"{BASE_URL}{endpoint}"

    try:
        with open(audio_file_path, "rb") as f:
            files = {"file": f}
            response = requests.post(url, files=files, timeout=60)

        print(f"状态码: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            print(f"✅ 成功")

            # 打印关键字段
            if feature_name == "pulse-clarity":
                print(f"  脉动清晰度: {result.get('pulse_clarity', 'N/A')}")
                print(f"  置信度: {result.get('confidence', 'N/A')}")
            elif feature_name == "mode":
                print(f"  调式值: {result.get('mode', 'N/A')}")
                print(f"  模式: {result.get('mode_label', 'N/A')}")
                print(f"  置信度: {result.get('confidence', 'N/A')}")
            elif feature_name == "tempo":
                print(f"  BPM: {result.get('bpm', 'N/A')}")
                print(f"  置信度: {result.get('confidence', 'N/A')}")
                print(f"  节拍数: {result.get('beat_count', 'N/A')}")
            elif feature_name == "loudness":
                print(f"  平均响度 (dB): {result.get('mean_loudness_db', 'N/A')}")
                print(f"  峰值响度 (dB): {result.get('peak_loudness_db', 'N/A')}")
                print(f"  动态范围 (dB): {result.get('dynamic_range_db', 'N/A')}")
            elif feature_name == "f0-envelope":
                print(f"  平均基频 (Hz): {result.get('mean_f0', 'N/A')}")
                print(f"  基频范围: {result.get('f0_range', 'N/A')}")
                print(f"  有声占比: {result.get('voicing_ratio', 'N/A')}")

            return True
        else:
            print(f"❌ 失败")
            print(f"错误信息: {response.text}")
            return False

    except Exception as e:
        print(f"❌ 异常: {e}")
        return False


def main() -> None:
    """主测试函数"""
    print("=" * 60)
    print("Audio Feature Extractor Service - 快速测试")
    print("=" * 60)

    # 检查服务是否运行
    if not test_health():
        print("\n❌ 服务未运行，请先启动服务:")
        print("  python app.py")
        print("或使用 Docker:")
        print("  docker run -p 8000:8000 audio-extractor:latest")
        sys.exit(1)

    # 查找测试音频文件
    audio_file = None
    for path_pattern in ["*.wav", "*.mp3", "*.flac"]:
        candidates = list(Path(".").glob(path_pattern))
        if candidates:
            audio_file = candidates[0]
            break

    if not audio_file:
        print("\n⚠️  未找到测试音频文件")
        print("请在当前目录放置一个 WAV/MP3/FLAC 文件进行测试")
        print("或运行: python test_extractor.py /path/to/audio.wav")
        sys.exit(1)

    print(f"\n使用测试音频: {audio_file}")

    # 测试所有端点
    results = {}
    for feature_name in ENDPOINTS.keys():
        results[feature_name] = test_feature_extraction(
            feature_name, audio_file)

    # 汇总结果
    print("\n" + "=" * 60)
    print("测试汇总")
    print("=" * 60)

    passed = sum(1 for v in results.values() if v)
    total = len(results)

    for feature_name, success in results.items():
        status = "✅ 通过" if success else "❌ 失败"
        print(f"{feature_name:20} {status}")

    print(f"\n总计: {passed}/{total} 通过")

    return 0 if passed == total else 1


if __name__ == "__main__":
    import sys

    # 如果提供了命令行参数，作为音频文件路径
    if len(sys.argv) > 1:
        audio_file = sys.argv[1]
        print("=" * 60)
        print(f"Audio Feature Extractor Service - 测试: {audio_file}")
        print("=" * 60)

        if not test_health():
            print("\n❌ 服务未运行")
            sys.exit(1)

        results = {}
        for feature_name in ENDPOINTS.keys():
            results[feature_name] = test_feature_extraction(
                feature_name, audio_file)

        print("\n" + "=" * 60)
        print("测试汇总")
        print("=" * 60)
        passed = sum(1 for v in results.values() if v)
        print(f"总计: {passed}/{len(results)} 通过")
        sys.exit(0 if passed == len(results) else 1)
    else:
        sys.exit(main())
