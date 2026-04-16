CREATE TABLE IF NOT EXISTS track (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    duration_s FLOAT8 NOT NULL,
    global_confidence FLOAT8 NOT NULL,
    thumbnail_start FLOAT8 NOT NULL,
    thumbnail_end FLOAT8 NOT NULL,
    thumbnail_duration FLOAT8 NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY -- name VARCHAR(255) NOT NULL
);

CREATE TYPE platform AS ENUM ('jamendo');

CREATE TABLE IF NOT EXISTS track_platform (
    track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    platform platform NOT NULL,
    platform_id VARCHAR(255) NOT NULL
);

CREATE TYPE mode AS ENUM ('major', 'minor');

CREATE TYPE tempo_category AS ENUM ('slow', 'moderate', 'fast');

CREATE TABLE IF NOT EXISTS track_global_risks (
    track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    mode mode NOT NULL,
    mode_score FLOAT8 NOT NULL,
    pulse_clarity FLOAT8 NOT NULL,
    tempo_category tempo_category NOT NULL,
    tempo_bpm FLOAT8 NOT NULL,
    dynamic_range_db FLOAT8 NOT NULL,
    mean_loudness_db FLOAT8 NOT NULL,
    mean_f0_hz FLOAT8 NOT NULL,
    f0_range_hz FLOAT8 NOT NULL
);

CREATE TABLE IF NOT EXISTS track_predictions_meta (
    track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    mode_mean FLOAT8 NOT NULL,
    pulse_clarity_mean FLOAT8 NOT NULL,
    tempo_mean_bpm FLOAT8 NOT NULL,
    music_envelope_mean FLOAT8 NOT NULL,
    music_envelope_std FLOAT8 NOT NULL,
    f0_envelope_mean_hz FLOAT8 NOT NULL,
    loudness_envelope_mean FLOAT8 NOT NULL,
    loudness_stability FLOAT8 NOT NULL,
    smoothness JSONB NOT NULL -- {head: {f0_mean, music_mean, loudness_mean}, tail: {f0_mean, music_mean, loudness_mean}}
);

CREATE TABLE IF NOT EXISTS track_validation_arrays (
    track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    sampling_rate_hz FLOAT8 NOT NULL,
    array_length INT NOT NULL,
    music_envelope_4hz FLOAT8 [] NOT NULL,
    f0_envelope_hz_4hz FLOAT8 [] NOT NULL,
    loudness_envelope_4hz FLOAT8 [] NOT NULL
);

-- (deprecated)
-- CREATE TABLE IF NOT EXISTS track_prediction (
--     track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
--     arousal FLOAT8 NOT NULL,
--     relaxation FLOAT8 NOT NULL,
--     timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
CREATE TABLE IF NOT EXISTS full_track_feature (
    f0_envelope FLOAT8 [] NOT NULL,
    music_envelope FLOAT8 [] NOT NULL,
    loudness_envelope FLOAT8 [] NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS track_hrv_eff_predict (
    track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    hr FLOAT8 NOT NULL,
    rmssd FLOAT8 NOT NULL,
    lfhf FLOAT8 NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TODO
-- CREATE TABLE IF NOT EXISTS play_history (
--     track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
--     user_id VARCHAR(64) NOT NULL,
--     timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
CREATE TABLE IF NOT EXISTS listen_history (
    track_id VARCHAR(64) NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);