"""
Global configuration for the ML training server.
"""

# Feature order must be consistent between training and inference
FEATURE_NAMES = [
    # Audio features (global)
    "tempo", "tempo_std", "mode", "pulse_clarity",
    "loud_mean", "loud_std", "loud_skewness",
    "chroma_flux_mean", "chroma_flux_std", "chroma_flux_skewness",
    # Audio features (thumbnail)
    "thumbnail_tempo", "thumbnail_tempo_std", "thumbnail_mode", "thumbnail_pulse_clarity",
    "thumbnail_loud_mean", "thumbnail_loud_std", "thumbnail_loud_skewness",
    "thumbnail_chroma_flux_mean", "thumbnail_chroma_flux_std", "thumbnail_chroma_flux_skewness",
    # User HRV state before listening
    "u_hr", "u_rmssd", "u_sdnn", "u_pnn50", "u_lf", "u_hf",
    # Context
    "listen_duration_s",
    "daytime_section",   # encoded: morning=0, afternoon=1, evening=2, night=3
]

HRV_TARGETS = ["hr", "rmssd", "sdnn", "pnn50", "lf", "hf"]

DAYTIME_ENCODING = {
    "morning": 0,
    "afternoon": 1,
    "evening": 2,
    "night": 3,
}

# Default XGBoost hyperparameters
DEFAULT_HYPERPARAMS = {
    "n_estimators": 500,
    "max_depth": 4,
    "learning_rate": 0.1,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 3,
    "objective": "reg:squarederror",
    "random_state": 42,
}

LOG_LEVEL = "INFO"
