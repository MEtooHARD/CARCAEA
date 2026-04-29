CREATE TABLE track (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    duration_s FLOAT8 NOT NULL
);

CREATE TABLE base_audio_features (
    track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    -- 
    sr_hz INT NOT NULL,
    len INT NOT NULL,
    -- 
    chroma_matrix FLOAT8 [] [] NOT NULL,
    chroma_flux FLOAT8 [] NOT NULL,
    loudness_db FLOAT8 [] NOT NULL,
    -- 
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_track_chroma_timelines_timestamp ON base_audio_features(track_id, timestamp DESC);

CREATE TYPE platform AS ENUM ('jamendo');

CREATE TABLE track_platform (
    track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    platform platform NOT NULL,
    platform_id VARCHAR(255) NOT NULL
);

CREATE TABLE track_thumbnail (
    track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    array_length INT NOT NULL,
    -- 
    start_sec FLOAT8 NOT NULL,
    start_frame INT NOT NULL,
    end_sec FLOAT8 NOT NULL,
    end_frame INT NOT NULL,
    -- 
    score FLOAT8 NOT NULL,
    coverage FLOAT8 NOT NULL,
    -- 
    loudness_4hz FLOAT8 [] NOT NULL,
    chroma_matrix_4hz FLOAT8 [] [] NOT NULL,
    chroma_flux_4hz FLOAT8 [] NOT NULL
);

CREATE TABLE track_thumbnail_statistics (
    track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    -- 
    tempo_bpm FLOAT8 NOT NULL,
    mode FLOAT8 NOT NULL,
    pulse_clarity FLOAT8 NOT NULL,
    -- 
    loudness_mean FLOAT8 NOT NULL,
    loudness_median FLOAT8 NOT NULL,
    loudness_std FLOAT8 NOT NULL,
    loudness_min FLOAT8 NOT NULL,
    loudness_max FLOAT8 NOT NULL,
    loudness_skewness FLOAT8 NOT NULL,
    loudness_kurtosis FLOAT8 NOT NULL,
    -- 
    chroma_flux_mean FLOAT8 NOT NULL,
    chroma_flux_median FLOAT8 NOT NULL,
    chroma_flux_std FLOAT8 NOT NULL,
    chroma_flux_min FLOAT8 NOT NULL,
    chroma_flux_max FLOAT8 NOT NULL,
    chroma_flux_skewness FLOAT8 NOT NULL,
    chroma_flux_kurtosis FLOAT8 NOT NULL,
    -- 
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE track_global_statistics (
    track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    -- 
    tempo_bpm FLOAT8 NOT NULL,
    mode FLOAT8 NOT NULL,
    pulse_clarity FLOAT8 NOT NULL,
    -- 
    loudness_mean FLOAT8 NOT NULL,
    loudness_median FLOAT8 NOT NULL,
    loudness_std FLOAT8 NOT NULL,
    loudness_min FLOAT8 NOT NULL,
    loudness_max FLOAT8 NOT NULL,
    loudness_skewness FLOAT8 NOT NULL,
    loudness_kurtosis FLOAT8 NOT NULL,
    -- 
    chroma_flux_mean FLOAT8 NOT NULL,
    chroma_flux_median FLOAT8 NOT NULL,
    chroma_flux_std FLOAT8 NOT NULL,
    chroma_flux_min FLOAT8 NOT NULL,
    chroma_flux_max FLOAT8 NOT NULL,
    chroma_flux_skewness FLOAT8 NOT NULL,
    chroma_flux_kurtosis FLOAT8 NOT NULL,
    -- 
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE track_hrv_eff_predict (
    track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    hr FLOAT8 NOT NULL,
    rmssd FLOAT8 NOT NULL,
    lfhf FLOAT8 NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE listen_history (
    track_id VARCHAR(64) NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);