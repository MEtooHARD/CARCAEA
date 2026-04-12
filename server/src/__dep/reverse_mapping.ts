import { clamp } from "../util/math";

/**
 * 定義單一時間點的心率變異度 (HRV) 生理狀態
 */
export interface HRVState {
    /** 
     * 心率 (Heart Rate, BPM)
     * 生理意義：基礎的心血管輸出指標。增加通常與交感神經激活 (喚醒/壓力) 相關；降低與放鬆相關。
     */
    hr_bpm: number;

    /** 
     * 相鄰心跳間距均方根差 (RMSSD, ms)
     * 生理意義：副交感神經 (迷走神經) 活性的最核心時域指標。
     * 數值提升代表深層放鬆與自我安撫；在壓力或焦慮狀態下會急遽下降。
     */
    rmssd_ms: number;

    /** 
     * 低頻與高頻能量比值 (LF/HF Ratio, 無單位)
     * 生理意義：評估「交感/副交感神經平衡 (Sympathovagal Balance)」的核心頻域指標。
     * 大於 2.0~2.5 代表交感神經主導 (亢奮、壓力)；小於 1.0 代表副交感神經主導 (鎮靜、睡眠)。
     */
    lf_hf_ratio: number;
}

/**
 * 情感目標向量 (Target Emotion Vector)
 * 用於在資料庫中進行歐式距離與餘弦相似度的音樂檢索
 */
export interface TargetEmotionVector {
    /** 目標交感喚醒度 (0.0 ~ 1.0) */
    target_arousal: number;
    /** 目標副交感放鬆度 (0.0 ~ 1.0) */
    target_relaxation: number;
}

/**
 * 計算生理指標的正規化變化率 (Normalized Change Rate, Delta)
 * 為了與情感空間矩陣的權重對接，強制將變化率鎖定在 -1.0 (-100%) 到 1.0 (+100%) 之間。
 * 
 * @param baseline 使用者當下的生理基準值
 * @param target 醫療人員或系統預期的生理目標值
 * @returns 介於 -1.0 到 1.0 之間的安全變化率
 */
function calculateNormalizedVariation(baseline: number, target: number): number {
    if (baseline <= 0) return 0.0; // 避免除以零的例外錯誤
    const delta = (target - baseline) / baseline;
    return clamp(delta, -1.0, 1.0);
}

/**
 * 【反向檢索核心引擎】
 * 從「預期的 HRV 變化量 (交感/副交感調節)」逆向映射為「音樂情感目標向量」
 * 
 * @param currentHRV 使用者當下穿戴裝置測得的 HRV 數值
 * @param targetHRV 系統希望使用者達到的 HRV 目標數值
 * @returns 包含 target_arousal 與 target_relaxation 的向量，供 SQL 或 KNN 檢索使用
 */
export function mapHRVTargetToEmotion_SympathovagalBalanceMapping(
    currentHRV: HRVState,
    targetHRV: HRVState
): TargetEmotionVector {

    // 1. 計算各項生理指標的安全變化率 (Delta: -1.0 ~ 1.0)
    const delta_HR = calculateNormalizedVariation(currentHRV.hr_bpm, targetHRV.hr_bpm);
    const delta_RMSSD = calculateNormalizedVariation(currentHRV.rmssd_ms, targetHRV.rmssd_ms);
    const delta_LFHF = calculateNormalizedVariation(currentHRV.lf_hf_ratio, targetHRV.lf_hf_ratio);

    // 2. 計算目標喚醒度 (Target Arousal)
    // 演算法邏輯：喚醒度與 LF/HF、心率的提升呈正相關；與副交感指標 RMSSD 呈負相關。
    // 基底值為 0.5 (代表 Yerkes-Dodson 法則的最佳表現中心點)
    const rawArousal = 0.5
        + (0.4 * delta_LFHF)
        + (0.3 * delta_HR)
        - (0.3 * delta_RMSSD);

    // 3. 計算目標放鬆度 (Target Relaxation)
    // 演算法邏輯：放鬆度高度依賴副交感神經指標 RMSSD 的提升；而交感指標 (LF/HF, HR) 則作為扣分項。
    const rawRelaxation = 0.5
        + (0.5 * delta_RMSSD)
        - (0.3 * delta_LFHF)
        - (0.2 * delta_HR);

    // 4. 強制將最終輸出的目標分數鎖定在 0.0 ~ 1.0 之間，對應於資料庫的預測尺度
    return {
        target_arousal: clamp(rawArousal, 0.0, 1.0),
        target_relaxation: clamp(rawRelaxation, 0.0, 1.0)
    };
}

/* ============================================================================
 * 【使用範例】: 深度放鬆與抗焦慮情境 (如：就寢前的鎮靜引導)
 * ============================================================================
 * 
 * const currentUserState: HRVState = { hr_bpm: 85, rmssd_ms: 20, lf_hf_ratio: 2.2 }; // 交感神經亢奮、高壓
 * const expectedTargetState: HRVState = { hr_bpm: 65, rmssd_ms: 38, lf_hf_ratio: 0.9 }; // 目標為深層放鬆
 * 
 * const searchVector = mapHRVTargetToEmotion_SympathovagalBalanceMapping(currentUserState, expectedTargetState);
 * 
 * console.log(searchVector); 
 * // 預期輸出將會是一個低 Arousal (如 0.1) 且高 Relaxation (如 0.85) 的向量。
 * // 推薦系統接著會用此向量去資料庫尋找歐式距離最近且餘弦方向最一致的音樂 (如動態極小、偏大調的空靈音樂)。
 */
