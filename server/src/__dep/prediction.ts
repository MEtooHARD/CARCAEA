import { clamp } from "../util/numeric";

/**
 * 定義傳入的音樂聲學特徵介面
 * 這些特徵對應於系統先前萃取出的 JSON 數據
 */
export interface AudioFeatures {
    /** 平均響度 (dB)，通常為負數，例如 -3.66 dB */
    loudness_envelope_mean: number;
    /** 脈動清晰度 (0.0 ~ 1.0)，反映節拍的強烈程度 */
    pulse_clarity_mean: number;
    /** 全曲或片段的平均 BPM */
    tempo_mean_bpm: number;
    /** 基頻 (F0) 的活躍比例 (0.0 ~ 1.0)，可用 F0 陣列中非零元素的比例來計算 */
    f0_activity_ratio: number;
    /** 調性分數 (0.0 ~ 1.0)，越接近 1 代表越大調 (Major) */
    mode_mean: number;
    /** 響度穩定度 (0.0 ~ 1.0)，反映音量起伏的平緩程度 */
    loudness_stability: number;
    /** 動態範圍 (dB)，例如 71.28 dB */
    dynamic_range_db: number;
}

/**
 * 計算交感神經喚醒與心肺共振指數 (Arousal & Cardiorespiratory Coupling)
 * 
 * 【影響的 HRV 項目與生理意義】：
 * - ⬆️ 增加 (Increase) : LF/HF Ratio (低頻高頻比，代表交感神經主導與壓力/亢奮狀態)
 * - ⬆️ 增加 (Increase) : HR (Heart Rate, 心率)
 * - ⬇️ 降低 (Decrease) : RMSSD (相鄰心跳間距均方根差，副交感神經核心指標)
 * - ⬇️ 降低 (Decrease) : HF (High Frequency Power, 高頻能量)
 * 
 * @param features 音樂聲學特徵物件
 * @returns {number} 0.0 ~ 1.0 的交感神經喚醒驅動力分數
 */
export function calculateSympatheticArousal_IncreaseLFHF_DecreaseRMSSD(features: AudioFeatures): number {
    // 1. 響度正規化 (L_norm)：假設 -30 dB 為極安靜 (0.0)，0 dB 為極大聲 (1.0)
    const lNorm = clamp((features.loudness_envelope_mean + 30) / 30);

    // 2. 節奏喚醒因子 (T_factor)：基於文獻的 V 字型效應 (106 BPM 為最自然中速，過快或過慢皆會提高喚醒度)
    const tFactor = clamp(Math.abs(features.tempo_mean_bpm - 106) / 50);

    // 3. 特徵權重代入多元線性迴歸公式 (基於文獻實證權重比例進行微調與正規化)
    const alphaLoudness = 0.40;
    const alphaPulseClarity = 0.30;
    const alphaTempo = 0.15;
    const alphaF0 = 0.15; // 旋律連續性(CCM 驗證的因果驅動力)

    const arousalScore =
        (alphaLoudness * lNorm) +
        (alphaPulseClarity * features.pulse_clarity_mean) +
        (alphaTempo * tFactor) +
        (alphaF0 * features.f0_activity_ratio);

    return clamp(arousalScore);
}

/**
 * 計算副交感神經放鬆與愉悅指數 (Relaxation & Parasympathetic Drive)
 * 
 * 【影響的 HRV 項目與生理意義】：
 * - ⬆️ 增加 (Increase) : RMSSD (副交感/迷走神經活性的最核心時域指標，與深層放鬆高度相關)
 * - ⬆️ 增加 (Increase) : SDNN (整體自律神經總體調節能力與長期變異度)
 * - ⬆️ 增加 (Increase) : HF (High Frequency Power, 反映呼吸性竇性心律不整 RSA)
 * - ⬇️ 降低 (Decrease) : HR (Heart Rate, 心率)
 * - ⬇️ 降低 (Decrease) : LF/HF Ratio (使自律神經平衡朝副交感端偏移)
 * 
 * @param features 音樂聲學特徵物件
 * @param arousalScore 先前算出的交感喚醒分數 (作為反向懲罰項)
 * @returns {number} 0.0 ~ 1.0 的副交感神經放鬆驅動力分數
 */
export function calculateParasympatheticRelaxation_IncreaseRMSSD_DecreaseLFHF(
    features: AudioFeatures,
    arousalScore: number
): number {
    // 1. 動態範圍正規化 (D_norm)：假設 0 dB 為極平穩 (0.0)，100 dB 為極端動態 (1.0)
    // 動態過大易產生驚嚇反射 (Startle reflex)，大幅削弱放鬆感
    const dNorm = clamp(features.dynamic_range_db / 100);

    // 2. 特徵權重代入公式
    const betaMode = 0.35;        // 大調 (Major) 帶來的正面效價 (Valence)
    const betaStability = 0.35;   // 響度穩定度 (平緩無突波)
    const penaltyDynamic = 0.40;  // 對過大動態範圍的嚴格扣分
    const penaltyArousal = 0.30;  // 喚醒度本身的負面抵銷

    let relaxScore =
        (betaMode * features.mode_mean) +
        (betaStability * features.loudness_stability) -
        (penaltyDynamic * dNorm) -
        (penaltyArousal * arousalScore);

    // 為了確保分數合理，將基礎平移並限制在 0~1 區間
    // (加上 0.3 是一個 Baseline offset，避免所有歌曲的分數都過低)
    return clamp(relaxScore + 0.3);
}

/**
 * 整合執行函式：一次產出對 HRV 兩大神經系統的預測影響力
 * 
 * @param features 萃取出的音樂聲學特徵
 * @returns 包含交感喚醒 (LF/HF⬆️) 與 副交感放鬆 (RMSSD⬆️) 的預測分數物件
 */
export function predictHRVImpactScores(features: AudioFeatures) {
    const sympatheticArousal = calculateSympatheticArousal_IncreaseLFHF_DecreaseRMSSD(features);
    const parasympatheticRelaxation = calculateParasympatheticRelaxation_IncreaseRMSSD_DecreaseLFHF(features, sympatheticArousal);

    return {
        /** 交感神經驅動力 (驅動心肺共振、提高心率與 LF/HF) */
        sympathetic_arousal_score: sympatheticArousal,
        /** 副交感神經驅動力 (驅動深層放鬆、提高 RMSSD 與 HF) */
        parasympathetic_relaxation_score: parasympatheticRelaxation
    };
}