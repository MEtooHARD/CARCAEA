import type { AUDIO_FEATURES, HR_RMSSD_LFHF } from "../types/metrix";

export function euclideanDistance(vecA: HR_RMSSD_LFHF, vecB: HR_RMSSD_LFHF): number {
    return Math.sqrt(vecA.reduce((sum, val, idx) => sum + Math.pow(val - vecB[idx], 2), 0));
};

export function cosineSimilarity(vecA: HR_RMSSD_LFHF, vecB: HR_RMSSD_LFHF): number {
    const dotProduct = vecA.reduce((sum, val, idx) => sum + val * vecB[idx], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
};

// 1. 定義矩陣權重 (基於文獻的冷啟動參數)
const WeightMatrix: [AUDIO_FEATURES, AUDIO_FEATURES, AUDIO_FEATURES] = [
    // BPM, Loud, F0_Var, PC, Pitch
    [0.4, 0.3, 0.0, 0.2, 0.2], // HR 影響力
    [-0.3, -0.2, -0.4, -0.2, -0.3], // RMSSD 影響力
    [0.3, 0.3, 0.3, 0.4, 0.3]  // LF/HF 影響力
];
const BiasVector: HR_RMSSD_LFHF = [-0.55, 0.70, -0.80];

// 2. 直接生理預測函式
export function predictHRVImpact(features: AUDIO_FEATURES): HR_RMSSD_LFHF {
    const predictedDelta: HR_RMSSD_LFHF = [0, 0, 0]; // [Delta_HR, Delta_RMSSD, Delta_LFHF]

    for (const i of [0, 1, 2] as const) {
        let dotProduct = 0;
        for (const j of [0, 1, 2, 3, 4] as const)
            dotProduct += WeightMatrix[i][j] * features[j];

        // 將特徵乘積加上平移常數，並將結果限制在合理的變化率區間 [-1.0, 1.0]
        predictedDelta[i] = Math.max(-1.0, Math.min(1.0, dotProduct + BiasVector[i]));
    }

    return predictedDelta; // 回傳 [Delta_HR, Delta_RMSSD, Delta_LFHF]
}
