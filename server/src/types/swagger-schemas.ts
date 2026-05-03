/**
 * Swagger/OpenAPI schema definitions for database entities and DTOs
 */

export const swaggerSchemas = {
    HRVMetrics: {
        type: 'object',
        required: ['hr', 'rmssd', 'sdnn', 'pnn50', 'lf', 'hf'],
        properties: {
            hr: { type: 'number', description: 'Heart rate (bpm)' },
            rmssd: { type: 'number', description: 'RMSSD (ms)' },
            sdnn: { type: 'number', description: 'SDNN (ms)' },
            pnn50: { type: 'number', description: 'pNN50 (%)' },
            lf: { type: 'number', description: 'LF power (ms²)' },
            hf: { type: 'number', description: 'HF power (ms²)' },
        },
    },

    HRVLogMetrics: {
        type: 'object',
        description: 'ln-scale statistics for the three log-normally distributed HRV metrics (rmssd, lf, hf). Must be computed from the raw sample series — NOT derived from the raw mean/std (Jensen\'s inequality prevents back-calculation).',
        required: ['rmssd', 'lf', 'hf'],
        properties: {
            rmssd: { type: 'number', description: 'E[ln(rmssd)] or std[ln(rmssd)] depending on context' },
            lf:    { type: 'number', description: 'E[ln(lf)] or std[ln(lf)] depending on context' },
            hf:    { type: 'number', description: 'E[ln(hf)] or std[ln(hf)] depending on context' },
        },
    },

    HRVBaseline: {
        type: 'object',
        required: ['literal', 'std'],
        description: 'HRV baseline for one daytime section. `literal` and `std` are computed on the raw scale. `ln_mean` / `ln_std` are optional but recommended for rmssd/lf/hf (log-normally distributed). Because E[ln(x)] \u2260 ln(E[x]) (Jensen\'s inequality), ln_mean must be computed as mean(ln(sample_i)) directly from the raw sample series \u2014 it cannot be derived from `literal` after the fact.',
        properties: {
            literal: { $ref: '#/components/schemas/HRVMetrics', description: 'Sample mean of each raw HRV metric across baseline readings.' },
            std:     { $ref: '#/components/schemas/HRVMetrics', description: 'Sample std dev of each raw HRV metric across baseline readings.' },
            ln_mean: { allOf: [{ $ref: '#/components/schemas/HRVLogMetrics' }], nullable: true, description: 'E[ln(x)] for rmssd/lf/hf. Compute as mean(ln(sample_i)) over baseline readings.' },
            ln_std:  { allOf: [{ $ref: '#/components/schemas/HRVLogMetrics' }], nullable: true, description: 'std[ln(x)] for rmssd/lf/hf. Compute as std(ln(sample_i)) over baseline readings.' },
        },
    },

    Track: {
        type: 'object',
        properties: {
            id: { type: 'string', description: 'Track UUID' },
            name: { type: 'string', description: 'Track name' },
            duration_s: { type: 'number', description: 'Duration in seconds' },
            hidden: { type: 'boolean', description: 'Whether track is hidden' },
            hidden_reason: {
                type: 'string',
                nullable: true,
                enum: ['not_streamable', 'too_short', 'too_long'],
                description: 'Reason for hiding (if hidden=true)',
            },
            created_at: { type: 'string', format: 'date-time' },
        },
    },

    TrackAudioFeatures: {
        type: 'object',
        properties: {
            track_id: { type: 'string' },
            tempo: { type: 'number', description: 'Dominant tempo (BPM). Derived from sliding-window timeline (window=30s, step=10s), each window uses librosa.feature.tempo with onset_envelope (hop_length=512 @ 22050Hz). Final value selected by max pulse_clarity-weighted sum after BPM snapping.' },
            tempo_std: { type: 'number', description: 'Tempo std dev across the windowed timeline (one value per 10s).' },
            mode: { type: 'number', description: 'Mode score (0=minor, 1=major). n_fft=4096, hop_length=512 @ 22050Hz.' },
            pulse_clarity: { type: 'number', description: 'Pulse clarity score (0–1). Sliding-window tempogram-based (window=30s, step=10s), hop_length=512 @ 22050Hz per window.' },
            loud_mean: { type: 'number', description: 'Loudness mean (dB). Continuous envelope at 4Hz (hop_length=512 @ 22050Hz, cubic-spline resampled).' },
            loud_std: { type: 'number', description: 'Loudness std dev.' },
            loud_skewness: { type: 'number', description: 'Loudness skewness.' },
            chroma_flux_mean: { type: 'number', description: 'Chroma flux mean. Sampled at 4Hz.' },
            chroma_flux_std: { type: 'number', description: 'Chroma flux std dev.' },
            chroma_flux_skewness: { type: 'number', description: 'Chroma flux skewness.' },
            thumbnail_tempo: { type: 'number', description: 'Mode of snapped tempo values within the thumbnail segment.' },
            thumbnail_tempo_std: { type: 'number' },
            thumbnail_mode: { type: 'number' },
            thumbnail_pulse_clarity: { type: 'number' },
            thumbnail_loud_mean: { type: 'number' },
            thumbnail_loud_std: { type: 'number' },
            thumbnail_loud_skewness: { type: 'number' },
            thumbnail_chroma_flux_mean: { type: 'number' },
            thumbnail_chroma_flux_std: { type: 'number' },
            thumbnail_chroma_flux_skewness: { type: 'number' },
            thumbnail_start_sec: { type: 'number' },
            thumbnail_end_sec: { type: 'number' },
            thumbnail_coverage: { type: 'number' },
            thumbnail_score: { type: 'number' },
            timestamp: { type: 'string', format: 'date-time' },
        },
    },

    TrackMetadata: {
        type: 'object',
        properties: {
            track_id: { type: 'string' },
            artist_name: { type: 'string', nullable: true },
            genres: { type: 'array', items: { type: 'string' } },
            instruments: { type: 'array', items: { type: 'string' } },
            vartags: { type: 'array', items: { type: 'string' } },
            vocalinstrumental: { type: 'boolean', nullable: true },
            acousticelectric: { type: 'boolean', nullable: true },
            acoustid: { type: 'string', nullable: true },
            mb_artist_id: { type: 'string', nullable: true },
            mb_recording_id: { type: 'string', nullable: true },
            tags_source: { type: 'string', nullable: true },
        },
    },

    TrackPlatform: {
        type: 'object',
        properties: {
            track_id: { type: 'string' },
            platform: { type: 'string', enum: ['jamendo', 'local'] },
            platform_id: { type: 'string', description: 'ID on that platform (e.g., Jamendo track ID)' },
        },
    },

    User: {
        type: 'object',
        properties: {
            id: { type: 'string', description: 'User UUID' },
            name: { type: 'string' },
            hidden: { type: 'boolean' },
            hidden_reason: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
        },
    },

    UserHrvBaseline: {
        type: 'object',
        properties: {
            id: { type: 'integer' },
            user_id: { type: 'string' },
            daytime_section: {
                type: 'string',
                enum: ['morning', 'afternoon', 'evening', 'night'],
            },
            hr_literal: { type: 'number' },
            hr_std: { type: 'number' },
            rmssd_literal: { type: 'number' },
            rmssd_std: { type: 'number' },
            sdnn_literal: { type: 'number' },
            sdnn_std: { type: 'number' },
            pnn50_literal: { type: 'number' },
            pnn50_std: { type: 'number' },
            lf_literal: { type: 'number' },
            lf_std: { type: 'number' },
            hf_literal: { type: 'number' },
            hf_std: { type: 'number' },
            rmssd_ln_mean: { type: 'number', nullable: true, description: 'E[ln(rmssd)] from baseline session. Required for ln-z-score ranking.' },
            rmssd_ln_std:  { type: 'number', nullable: true, description: 'std[ln(rmssd)] from baseline session.' },
            lf_ln_mean:    { type: 'number', nullable: true, description: 'E[ln(lf)] from baseline session.' },
            lf_ln_std:     { type: 'number', nullable: true, description: 'std[ln(lf)] from baseline session.' },
            hf_ln_mean:    { type: 'number', nullable: true, description: 'E[ln(hf)] from baseline session.' },
            hf_ln_std:     { type: 'number', nullable: true, description: 'std[ln(hf)] from baseline session.' },
            timestamp: { type: 'string', format: 'date-time' },
        },
    },

    TrackFeatEnvelopes: {
        type: 'object',
        description: 'Per-track audio feature envelopes. env_tempo / env_pulse_clarity are sliding-window series (window=12s, step=4s, one value per 4s). env_loudness_db / env_chroma_flux / env_chroma_matrix are continuous 4Hz series (one value per 0.25s, cubic-spline resampled). loud_chroma_sample_rate is always 4.',
        properties: {
            track_id: { type: 'string' },
            loud_chroma_sample_rate: { type: 'number', description: 'Sample rate of loudness/chroma envelope arrays (Hz). Always 4.' },
            env_tempo: {
                type: 'array', items: { type: 'number' },
                description: 'Tempo envelope (BPM). Sliding-window: window=30s, step=10s. Each value from librosa.feature.tempo with onset_envelope (hop_length=512 @ 22050Hz).',
            },
            env_pulse_clarity: {
                type: 'array', items: { type: 'number' },
                description: 'Pulse clarity envelope (0–1). Sliding-window: window=30s, step=10s. Each value is mean of max-per-frame tempogram (hop_length=512 @ 22050Hz) over that window.',
            },
            env_loudness_db: {
                type: 'array', items: { type: 'number' },
                description: 'Loudness envelope (dB). Continuous at 4Hz (hop_length=512 @ 22050Hz, cubic-spline resampled).',
            },
            env_chroma_flux: {
                type: 'array', items: { type: 'number' },
                description: 'Chroma flux envelope. Continuous at 4Hz.',
            },
            env_chroma_matrix: {
                type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 12, maxItems: 12 },
                description: 'CENS chroma matrix, shape [T, 12]. Each row is a 12-dimensional chroma vector. Continuous at 4Hz.',
            },
            timestamp: { type: 'string', format: 'date-time' },
        },
    },

    TrackWithFeatures: {
        type: 'object',
        description: 'Track with audio features joined',
        properties: {
            ...{ $ref: '#/components/schemas/Track' },
            tempo: { type: 'number' },
            tempo_std: { type: 'number' },
            mode: { type: 'number' },
            pulse_clarity: { type: 'number' },
            loud_mean: { type: 'number' },
            loud_std: { type: 'number' },
            loud_skewness: { type: 'number' },
            chroma_flux_mean: { type: 'number' },
            chroma_flux_std: { type: 'number' },
            chroma_flux_skewness: { type: 'number' },
        },
    },
};
