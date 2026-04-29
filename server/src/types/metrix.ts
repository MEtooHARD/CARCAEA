export type AUDIO_FEATURES = [number, number, number, number, number]; // [Tempo, Loudness, F0_Variance, Pulse_Clarity, ABS_Pitch]
export type HR_RMSSD_LFHF = [number, number, number];

export interface StatisticFeatures {
    mean: number;
    median: number;
    std: number;
    min: number;
    max: number;
    skewness: number;
    kurtosis: number;
}

export interface GlobFeatures {
    tempo_bpm: number;
    tempo_confidence: number;
    pulse_clarity: number;
    mode_score: number;

    loudness: StatisticFeatures;
    chroma_flux: StatisticFeatures;
}

/** C  C# D  D# E  F  F# G  G# A  A# B */
export type ChromaMatrix = [number, number, number, number, number, number, number, number, number, number, number, number];

export interface Timelines {
    loudness: number[];                // dB scale @ 4Hz
    chroma_matrix: ChromaMatrix[];         // shape: (n_points, 12)
    chroma_flux: number[];             // temporal change
}