import { cosineSimilarity, euclideanDistance } from "./pred";
import type { SmoothnessMetrics } from "../types/extract_complete_response";
import type { HR_RMSSD_LFHF } from "../types/metrix";

const MAX_DB_DIFF = 20.0; // 響度落差容忍上限 (dB)
const MAX_HZ_DIFF = 400.0; // 基頻落差容忍上限 (Hz)

// 根據文獻，Loudness 與 F0 對 HRV (交感/副交感神經) 有最直接的因果驅動力，因此賦予較高權重
const W_LOUDNESS = 0.45; // 響度權重
const W_F0 = 0.35; // 基頻權重
const W_MUSIC = 0.20; // 能量權重

const LOUDNESS_PENALTY = 2.5; // 指數衰減參數 (平順度懲罰強度)

/**
 * 計算兩首歌之間的「過場平順度分數」(0.0 ~ 1.0)
 * 分數越接近 1 代表越平順，越接近 0 代表落差過大（應受到懲罰）
 * 
 * @param currentOutro 正在播放歌曲的尾奏 (最後 15 秒) 特徵
 * @param nextIntro 候選歌曲的前奏 (前 15 秒) 特徵
 */
export function smoothness_score(currentOutro: SmoothnessMetrics, nextIntro: SmoothnessMetrics): number {

    // 步驟 1：即時正規化差值 (On-the-fly Normalization)
    // 將不同尺度的物理量，強制映射為 0.0 ~ 1.0 的「落差懲罰值」

    // A. 響度落差
    const deltaLoudness = Math.min(Math.abs(currentOutro.loudness_mean - nextIntro.loudness_mean) / MAX_DB_DIFF, 1.0);

    // B. 基頻落差
    const deltaF0 = Math.min(Math.abs(currentOutro.f0_mean - nextIntro.f0_mean) / MAX_HZ_DIFF, 1.0);

    // C. 能量落差
    const deltaMusic = Math.abs(currentOutro.music_mean - nextIntro.music_mean);

    // 步驟 2：加權特徵距離 (Weighted Distance)
    const distance = (W_LOUDNESS * deltaLoudness) + (W_F0 * deltaF0) + (W_MUSIC * deltaMusic);

    // 步驟 3：指數衰減轉換 (Exponential Decay Mapping)
    const score = Math.exp(-LOUDNESS_PENALTY * distance);

    return score;
}

// 3. 檢索與邊際遞減評分函式
export function rank(
    targetDelta: HR_RMSSD_LFHF,
    predDelta: HR_RMSSD_LFHF,
    playCount: number,
    similarityToPrev: number
): number {
    // A. 計算歐氏距離與餘弦相似度
    const distance = euclideanDistance(targetDelta, predDelta);
    const cosineSim = cosineSimilarity(targetDelta, predDelta);
    const baseScore = (0.7 * cosineSim) - (0.3 * distance);

    // B. 計算邊際遞減效應 (指數衰減 & 適應性懲罰)
    const lambda = -0.2;
    const familiarityDecay = Math.exp(lambda * playCount);
    const adaptationPenalty = 1.0 - (0.5 * similarityToPrev); // 避免連續播太像的歌

    return baseScore * familiarityDecay * adaptationPenalty;
}


// function euclideanDistance(targetDelta: HR_RMSSD_LFHF, predDelta: HR_RMSSD_LFHF): number {
//     const hrDiff = targetDelta[0] - predDelta[0];
//     const rmssdDiff = targetDelta[1] - predDelta[1];
//     const lfhfDiff = targetDelta[2] - predDelta[2];

//     return Math.sqrt(hrDiff ** 2 + rmssdDiff ** 2 + lfhfDiff ** 2);
// }

// function cosineSimilarity(targetDelta: HR_RMSSD_LFHF, predDelta: HR_RMSSD_LFHF): number {
//     // Dot product: a · b
//     const dotProduct =
//         targetDelta[0] * predDelta[0] +
//         targetDelta[1] * predDelta[1] +
//         targetDelta[2] * predDelta[2];

//     // Magnitude of target vector: ||a||
//     const magnitudeTarget = Math.sqrt(
//         targetDelta[0] ** 2 +
//         targetDelta[1] ** 2 +
//         targetDelta[2] ** 2
//     );

//     // Magnitude of pred vector: ||b||
//     const magnitudePred = Math.sqrt(
//         predDelta[0] ** 2 +
//         predDelta[1] ** 2 +
//         predDelta[2] ** 2
//     );

//     // Avoid division by zero
//     if (magnitudeTarget === 0 || magnitudePred === 0) {
//         return 0;
//     }

//     // Cosine similarity: (a · b) / (||a|| * ||b||)
//     return dotProduct / (magnitudeTarget * magnitudePred);
// }

