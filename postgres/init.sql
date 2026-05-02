CREATE TYPE platform AS ENUM ('jamendo', 'local');

CREATE TYPE daytime_section AS ENUM ('morning', 'afternoon', 'evening', 'night');

CREATE TABLE users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CREATE TABLE artist ();
-- 
CREATE TABLE track (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    duration_s FLOAT8 NOT NULL,
    hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE track_platform (
    track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    platform platform NOT NULL,
    platform_id VARCHAR(255) NOT NULL
);

CREATE TABLE track_metadata (
    track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    -- AcoustID / MusicBrainz
    -- AcoustID fingerprint ID
    acoustid VARCHAR(64),
    -- MusicBrainz Recording MBID (nullable)
    mb_recording_id UUID,
    -- MusicBrainz Artist MBID (nullable)
    mb_artist_id UUID,
    -- denormalized for query convenience
    artist_name TEXT,
    -- tags
    genres TEXT [] NOT NULL DEFAULT '{}',
    instruments TEXT [] NOT NULL DEFAULT '{}',
    vartags TEXT [] NOT NULL DEFAULT '{}',
    -- 'musicbrainz' | 'jamendo' | 'manual' | NULL
    tags_source VARCHAR(32),
    -- true if vocal
    vocalinstrumental BOOLEAN,
    -- true if acoustic
    acousticelectric BOOLEAN
);

CREATE TABLE track_audio_features (
    track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- global features
    tempo FLOAT8 NOT NULL,
    tempo_std FLOAT8 NOT NULL,
    mode FLOAT8 NOT NULL,
    pulse_clarity FLOAT8 NOT NULL,
    loud_mean FLOAT8 NOT NULL,
    loud_std FLOAT8 NOT NULL,
    loud_skewness FLOAT8 NOT NULL,
    chroma_flux_mean FLOAT8 NOT NULL,
    chroma_flux_std FLOAT8 NOT NULL,
    chroma_flux_skewness FLOAT8 NOT NULL,
    -- thumbnail
    thumbnail_start_sec FLOAT8 NOT NULL,
    thumbnail_end_sec FLOAT8 NOT NULL,
    thumbnail_score FLOAT8 NOT NULL,
    thumbnail_coverage FLOAT8 NOT NULL,
    -- thumbnail features
    thumbnail_tempo FLOAT8 NOT NULL,
    thumbnail_tempo_std FLOAT8 NOT NULL,
    thumbnail_mode FLOAT8 NOT NULL,
    thumbnail_pulse_clarity FLOAT8 NOT NULL,
    thumbnail_loud_mean FLOAT8 NOT NULL,
    thumbnail_loud_std FLOAT8 NOT NULL,
    thumbnail_loud_skewness FLOAT8 NOT NULL,
    thumbnail_chroma_flux_mean FLOAT8 NOT NULL,
    thumbnail_chroma_flux_std FLOAT8 NOT NULL,
    thumbnail_chroma_flux_skewness FLOAT8 NOT NULL
);

CREATE TABLE track_feat_envelopes (
    track_id VARCHAR(64) PRIMARY KEY REFERENCES track(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- 
    loud_chroma_sample_rate INT NOT NULL,
    env_loudness_db FLOAT8 [] NOT NULL,
    env_chroma_flux FLOAT8 [] NOT NULL,
    env_chroma_matrix FLOAT8 [] [] NOT NULL,
    -- 
    env_tempo FLOAT8 [] NOT NULL,
    env_mode FLOAT8 [] NOT NULL,
    env_pulse_clarity FLOAT8 [] NOT NULL
);

CREATE TABLE user_hrv_baseline (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    daytime_section daytime_section NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- 
    hr_literal FLOAT8 NOT NULL,
    hr_std FLOAT8 NOT NULL,
    -- 
    rmssd_literal FLOAT8 NOT NULL,
    rmssd_std FLOAT8 NOT NULL,
    -- 
    sdnn_literal FLOAT8 NOT NULL,
    sdnn_std FLOAT8 NOT NULL,
    -- 
    pnn50_literal FLOAT8 NOT NULL,
    pnn50_std FLOAT8 NOT NULL,
    -- 
    lf_literal FLOAT8 NOT NULL,
    lf_std FLOAT8 NOT NULL,
    -- 
    hf_literal FLOAT8 NOT NULL,
    hf_std FLOAT8 NOT NULL
);

CREATE TABLE xgb_models (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- 
    model_hr JSON NOT NULL,
    model_rmssd JSON NOT NULL,
    model_sdnn JSON NOT NULL,
    model_pnn50 JSON NOT NULL,
    model_lf JSON NOT NULL,
    model_hf JSON NOT NULL
);

CREATE TABLE listen_history (
    id SERIAL PRIMARY KEY,
    track_id VARCHAR(64) NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE recommendation_log (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_track_ids VARCHAR(64) [] NOT NULL,
    u_hrv_literal_at_request JSON NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE abort_rec_log (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reclog_id INT REFERENCES recommendation_log(id) ON DELETE CASCADE,
    original_track_id VARCHAR(64) NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    alternate_track_id VARCHAR(64) REFERENCES track(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE predictions (
    -- basic info
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id VARCHAR(64) NOT NULL REFERENCES track(id) ON DELETE CASCADE,
    listen_start_sec FLOAT8 NOT NULL,
    listen_end_sec FLOAT8 NOT NULL,
    reclog_id INT REFERENCES recommendation_log(id) ON DELETE CASCADE,
    baseline_id INT REFERENCES user_hrv_baseline(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- user status
    u_mental_status VARCHAR(32),
    u_hr_literal FLOAT8 NOT NULL,
    u_rmssd_literal FLOAT8 NOT NULL,
    u_sdnn_literal FLOAT8 NOT NULL,
    u_pnn50_literal FLOAT8 NOT NULL,
    u_lf_literal FLOAT8 NOT NULL,
    u_hf_literal FLOAT8 NOT NULL,
    -- actual
    r_mental_status VARCHAR(32),
    r_hr_literal FLOAT8 NOT NULL,
    r_rmssd_literal FLOAT8 NOT NULL,
    r_sdnn_literal FLOAT8 NOT NULL,
    r_pnn50_literal FLOAT8 NOT NULL,
    r_lf_literal FLOAT8 NOT NULL,
    r_hf_literal FLOAT8 NOT NULL
);

CREATE INDEX ON listen_history (user_id, timestamp DESC);

CREATE INDEX ON predictions (user_id, timestamp DESC);

CREATE INDEX ON recommendation_log (user_id, timestamp DESC);

CREATE INDEX ON xgb_models (user_id, active);

CREATE INDEX ON track_platform (platform, platform_id);

-- 支援 @> 陣列查詢
CREATE INDEX ON track_metadata USING GIN (genres);

CREATE INDEX ON track_metadata USING GIN (instruments);

CREATE INDEX ON track_metadata USING GIN (vartags);

-- 
CREATE INDEX ON track_metadata (mb_artist_id);