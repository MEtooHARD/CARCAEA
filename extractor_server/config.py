"""
全局配置文件
"""

# ==================== 音频处理配置 ====================

# 采样率 (Hz)
DEFAULT_SAMPLE_RATE = 22050

# 音频读取参数
AUDIO_MONO = True  # 转换为单声道
AUDIO_OFFSET = None  # 开始时间（秒）
AUDIO_DURATION = None  # 读取时长（秒，None=全部）

# ==================== 特征提取参数 ====================

# 脉动清晰度 (Pulse Clarity)
PULSE_CLARITY_HOP_LENGTH = 512
PULSE_CLARITY_FMIN = 60
PULSE_CLARITY_FMAX = 240

# 调式 (Mode)
MODE_CHROMA_TYPE = "stft"  # "stft" 或 "cqt"
MODE_N_FFT = 4096
MODE_HOP_LENGTH = 512

# 节奏速度 (Tempo)
TEMPO_HOP_LENGTH = 512
TEMPO_START_BPM = 60
TEMPO_STOP_BPM = 240

# 响度 (Loudness)
LOUDNESS_HOP_LENGTH = 512
LOUDNESS_FILTER_ORDER = 5  # Butterworth 滤波器阶数
LOUDNESS_CUTOFF_FREQ = 5  # 低通滤波截止频率 (Hz)

# 基频包络 (F0 Envelope)
F0_FMIN = 80  # 最小基频 (Hz)
F0_FMAX = 400  # 最大基频 (Hz)
F0_HOP_LENGTH = 512

# ==================== 服务配置 ====================

# 最大上传文件大小 (bytes, 默认 50MB)
MAX_UPLOAD_SIZE = 50 * 1024 * 1024

# 支持的音频格式
SUPPORTED_FORMATS = {".wav", ".mp3", ".flac", ".ogg", ".m4a"}

# ==================== 日志配置 ====================

LOG_LEVEL = "INFO"
