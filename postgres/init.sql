-- ID
CREATE TABLE IF NOT EXISTS id_sha256 (
    id VARCHAR(64) PRIMARY KEY
);

-- Embedding table for EfficientNet on Discogs dataset
CREATE TABLE IF NOT EXISTS emb_effnet_discogs400 (
    id VARCHAR(64) PRIMARY KEY REFERENCES id_sha256(id) ON DELETE CASCADE,
    embedding FLOAT8[] NOT NULL,  -- 1280d vector
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS emb_msd_musicnn (
    id VARCHAR(64) PRIMARY KEY REFERENCES id_sha256(id) ON DELETE CASCADE,
    embedding FLOAT8[] NOT NULL,  -- 200d vector
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS va_emomusic_msd_musicnn (
    id VARCHAR(64) PRIMARY KEY REFERENCES id_sha256(id) ON DELETE CASCADE,
    valence FLOAT8 NOT NULL,
    arousal FLOAT8 NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- CREATE INDEX ON emb_effnet_discogs USING HNSW (embedding vector_cosine_ops);