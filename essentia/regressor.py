# Requirements: pip install librosa numpy soundfile
# Usage: python predict_griffiths_va.py your_song.mp3

import librosa
import numpy as np
import sys

# REAL coefficients from Table 6
AROUSAL_REGRESSORS = [
    (-2.809, 36.83),   # Energy
    (-2.875, 166.3),   # Standard deviation energy
    (-2.791, 37.23)    # Median energy
]

VALENCE_REGRESSORS = [
    (-8.326, 60.0),     # Spectral spread
    (-8.302, 59.94),    # Medial spectral spread
    (-3.963, 17.56)     # Spectral flatness
]

def extract_and_normalize_features(audio_path, sr=22050):
    y, sr = librosa.load(audio_path, sr=sr, mono=True)
    
    # Arousal: Energy (RMS proxy)
    rms = librosa.feature.rms(y=y)[0]
    energy_mean   = np.mean(rms)
    energy_std    = np.std(rms)
    energy_median = np.median(rms)
    
    # Valence: Spectral
    bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
    spread_mean   = np.mean(bandwidth)
    spread_median = np.median(bandwidth)
    
    flatness = librosa.feature.spectral_flatness(y=y)[0]
    flatness_mean = np.mean(flatness)
    
    raw = {
        'energy_mean': energy_mean,
        'energy_std': energy_std,
        'energy_median': energy_median,
        'spread_mean': spread_mean,
        'spread_median': spread_median,
        'flatness_mean': flatness_mean
    }
    
    # Step 1: Rough min-max to [0,1] (initial guess; replace with your dataset stats!)
    # Tune these based on your 36 songs' min/max (run once to collect)
    norm = {}
    norm['energy_mean']   = np.clip((energy_mean - 0.0) / (0.5 + 1e-8), 0, 1)
    norm['energy_std']    = np.clip((energy_std - 0.0) / (0.3 + 1e-8), 0, 1)
    norm['energy_median'] = np.clip((energy_median - 0.0) / (0.5 + 1e-8), 0, 1)
    norm['spread_mean']   = np.clip((spread_mean - 300) / (4500 - 300 + 1e-8), 0, 1)  # Adjust after stats
    norm['spread_median'] = np.clip((spread_median - 300) / (4500 - 300 + 1e-8), 0, 1)
    norm['flatness_mean'] = np.clip(flatness_mean, 0, 1)  # Already 0~1
    
    return norm, raw

def predict_va(norm_features):
    arousal_preds = [
        AROUSAL_REGRESSORS[0][0] + AROUSAL_REGRESSORS[0][1] * norm_features['energy_mean'],
        AROUSAL_REGRESSORS[1][0] + AROUSAL_REGRESSORS[1][1] * norm_features['energy_std'],
        AROUSAL_REGRESSORS[2][0] + AROUSAL_REGRESSORS[2][1] * norm_features['energy_median']
    ]
    final_arousal = np.mean(arousal_preds)
    
    valence_preds = [
        VALENCE_REGRESSORS[0][0] + VALENCE_REGRESSORS[0][1] * norm_features['spread_mean'],
        VALENCE_REGRESSORS[1][0] + VALENCE_REGRESSORS[1][1] * norm_features['spread_median'],
        VALENCE_REGRESSORS[2][0] + VALENCE_REGRESSORS[2][1] * norm_features['flatness_mean']
    ]
    final_valence = np.mean(valence_preds)
    
    # Clip to reasonable (paper expected ~ -5 to +5)
    final_valence = np.clip(final_valence, -10, 10)
    final_arousal = np.clip(final_arousal, -10, 10)
    
    return final_valence, final_arousal

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python predict_griffiths_va.py your_song.mp3")
        sys.exit(1)
    
    audio_path = sys.argv[1]
    print(f"Processing: {audio_path}")
    
    try:
        norm_features, raw_features = extract_and_normalize_features(audio_path)
        
        print("\nRaw features (debug):")
        for k, v in raw_features.items():
            print(f"{k}: {v:.4f}")
        
        print("\nNormalized features (should be 0~1):")
        for k, v in norm_features.items():
            print(f"{k}: {v:.4f}")
        
        v, a = predict_va(norm_features)
        
        print("\nRaw Prediction (expected ~ -5 to +5):")
        print(f"Valence: {v:.3f}")
        print(f"Arousal: {a:.3f}")
        
        # To [-1,1] for Essentia comparison
        v_norm = np.clip(v / 5.0, -1, 1)
        a_norm = np.clip(a / 5.0, -1, 1)
        print(f"Normalized [-1,1]: Valence {v_norm:.3f}, Arousal {a_norm:.3f}")
        
        quadrant = ""
        if v > 0 and a > 0: quadrant = "Excited/Happy"
        elif v < 0 and a > 0: quadrant = "Angry/Tense"
        elif v < 0 and a < 0: quadrant = "Sad/Depressed"
        else: quadrant = "Calm/Relaxed"
        print(f"→ Possible quadrant: {quadrant}")
        
    except Exception as e:
        print(f"Error: {e}")