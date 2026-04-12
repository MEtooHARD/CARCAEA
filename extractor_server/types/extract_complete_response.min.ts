export interface Metadata {
    filename: string;
    full_duration_seconds: number;
    global_confidence_avg: number;
}

export interface ThumbnailMetadata {
    thumbnail_start_sec: number;
    thumbnail_end_sec: number;
    duration_seconds: number;
}

export interface GlobalRiskFeatures {
    mode: 'Major' | 'Minor' | string;
    mode_score: number;
    pulse_clarity: number;
    tempo_category: 'Slow' | 'Moderate' | 'Fast' | string;
    tempo_bpm: number;
    tempo_score: number;
    dynamic_range_db: number;
    dynamic_range_normalized: number;
    mean_loudness_db: number;
    mean_f0_hz: number;
    f0_range_hz: number;
}

export interface ThumbnailPredictionFeatures {
    mode_mean: number;
    pulse_clarity_mean: number;
    tempo_mean_bpm: number;
    music_envelope_mean: number;
    music_envelope_std: number;
    f0_envelope_mean_hz: number;
    loudness_envelope_mean: number;
    loudness_stability: number;
}

export interface ThumbnailValidationArrays {
    sampling_rate_hz: number;
    array_length: number;
    music_envelope_4hz: number[];
    f0_envelope_4hz: number[];
    loudness_envelope_4hz: number[];
}

export interface FullFeatures {
    f0_envelope_4hz: number[];
    music_envelope_4hz: number[];
    loudness_envelope_4hz: number[];
}

export interface SmoothnessMetrics {
    f0_mean: number;
    music_mean: number;
    loudness_mean: number;
}

export interface Smoothness {
    head: SmoothnessMetrics;
    tail: SmoothnessMetrics;
}

export interface ExtractCompleteResponse {
    metadata: Metadata;
    thumbnail_metadata: ThumbnailMetadata;
    global_risk_features: GlobalRiskFeatures;
    thumbnail_prediction_features: ThumbnailPredictionFeatures;
    thumbnail_validation_arrays: ThumbnailValidationArrays;
    full_features: FullFeatures;
    smoothness: Smoothness;
}
