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

    HRVBaseline: {
        type: 'object',
        required: ['literal', 'std'],
        properties: {
            literal: { $ref: '#/components/schemas/HRVMetrics' },
            std: { $ref: '#/components/schemas/HRVMetrics' },
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
            tempo: { type: 'number', description: 'Average tempo (BPM)' },
            tempo_std: { type: 'number', description: 'Tempo std dev' },
            mode: { type: 'number', description: 'Mode (0=minor, 1=major)' },
            pulse_clarity: { type: 'number', description: 'Pulse clarity score' },
            loud_mean: { type: 'number', description: 'Loudness mean (dB)' },
            loud_std: { type: 'number', description: 'Loudness std dev' },
            loud_skewness: { type: 'number', description: 'Loudness skewness' },
            chroma_flux_mean: { type: 'number' },
            chroma_flux_std: { type: 'number' },
            chroma_flux_skewness: { type: 'number' },
            thumbnail_tempo: { type: 'number' },
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
