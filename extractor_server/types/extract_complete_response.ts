/**
 * TypeScript 類型定義：/extract/complete 回傳物件
 * 版本：v3.0 (含完整曲子特徵 + 平滑度指標)
 * 醫療級 HRV 預測音樂特徵提取 API
 */

/**
 * 元數據：基本文件資訊
 */
export interface Metadata {
    /** 上傳的音頻文件名稱 */
    filename: string;

    /** 完整音樂時長（秒） */
    full_duration_seconds: number;

    /** 全局信心平均值 (0-1) */
    global_confidence_avg: number;
}

/**
 * 縮圖元數據：選中的代表性片段資訊
 */
export interface ThumbnailMetadata {
    /** 縮圖開始時間（秒） */
    thumbnail_start_sec: number;

    /** 縮圖結束時間（秒） */
    thumbnail_end_sec: number;

    /** 縮圖實際時長（秒）*/
    duration_seconds: number;
}

/**
 * 全局風險特徵：完整曲子的統計特徵
 */
export interface GlobalRiskFeatures {
    /** 調式判別：'Major'（大調）或 'Minor'（小調） */
    mode: 'Major' | 'Minor' | string;

    /** 調式信心分數 (0-1) */
    mode_score: number;

    /** 脈動清晰度（節奏規律性）(0-1) */
    pulse_clarity: number;

    /** 速度類別：'Slow'(<60BPM) / 'Moderate'(60-99BPM) / 'Fast'(≥100BPM) */
    tempo_category: 'Slow' | 'Moderate' | 'Fast' | string;

    /** 實際速度（拍/分）*/
    tempo_bpm: number;

    /** 速度信心分數 (0-1) */
    tempo_score: number;

    /** 動態範圍（dB） */
    dynamic_range_db: number;

    /** 正規化動態範圍 (0-1) */
    dynamic_range_normalized: number;

    /** 平均響度（dB） */
    mean_loudness_db: number;

    /** 平均基頻（Hz） */
    mean_f0_hz: number;

    /** 基頻範圍（Hz） */
    f0_range_hz: number;
}

/**
 * 縮圖預測特徵：選中片段的統計特徵
 */
export interface ThumbnailPredictionFeatures {
    /** 縮圖片段內的調式強度平均值 */
    mode_mean: number;

    /** 縮圖片段內的脈動清晰度平均值 (0-1) */
    pulse_clarity_mean: number;

    /** 縮圖片段內的速度平均值（BPM） */
    tempo_mean_bpm: number;

    /** 縮圖片段內的音樂能量平均值 (0-1) */
    music_envelope_mean: number;

    /** 縮圖片段內的音樂能量標準差 */
    music_envelope_std: number;

    /** 縮圖片段內的基頻平均值（Hz） */
    f0_envelope_mean_hz: number;

    /** 縮圖片段內的響度平均值（dB） */
    loudness_envelope_mean: number;

    /** 響度穩定性指標（響度波動程度） (0-1) */
    loudness_stability: number;
}

/**
 * 縮圖驗證陣列：4Hz 採樣率的時序驗證資料
 */
export interface ThumbnailValidationArrays {
    /** 採樣率（Hz）*/
    sampling_rate_hz: number;

    /** 陣列長度（樣本數）*/
    array_length: number;

    /** 縮圖片段的音樂能量包絡線 @ 4Hz (0-1) */
    music_envelope_4hz: number[];

    /** 縮圖片段的基頻包絡線 @ 4Hz (Hz，無聲區間為 0) */
    f0_envelope_4hz: number[];

    /** 縮圖片段的響度包絡線 @ 4Hz (dB) */
    loudness_envelope_4hz: number[];
}

/**
 * 完整曲子特徵：完整音樂的 4Hz 採樣包絡線
 */
export interface FullFeatures {
    /** 完整曲子的基頻包絡線 @ 4Hz (Hz，無聲區間為 0) */
    f0_envelope_4hz: number[];

    /** 完整曲子的音樂能量包絡線 @ 4Hz (0-1) */
    music_envelope_4hz: number[];

    /** 完整曲子的響度包絡線 @ 4Hz (dB) */
    loudness_envelope_4hz: number[];
}

/**
 * 平滑度指標：頭尾 15 秒的統計特徵
 */
export interface SmoothnessMetrics {
    /** 基頻平均值（Hz，無聲區間過濾） */
    f0_mean: number;

    /** 音樂能量平均值 (0-1) */
    music_mean: number;

    /** 響度平均值（dB） */
    loudness_mean: number;
}

/**
 * 平滑度物件：前後 15 秒的指標
 */
export interface Smoothness {
    /** 前 15 秒的平滑度指標 */
    head: SmoothnessMetrics;

    /** 後 15 秒的平滑度指標 */
    tail: SmoothnessMetrics;
}

/**
 * 完整的 /extract/complete 回傳物件
 * 
 * @example
 * ```typescript
 * const response: ExtractCompleteResponse = await fetch(
 *   'http://localhost:8000/extract/complete',
 *   {
 *     method: 'POST',
 *     body: formData // 包含 audio file
 *   }
 * ).then(r => r.json());
 * 
 * // 訪問各種特徵
 * console.log(response.global_risk_features.tempo_bpm); // 71.77 BPM
 * console.log(response.full_features.f0_envelope_4hz.length); // 1236 samples
 * console.log(response.smoothness.head.f0_mean); // 130.09 Hz
 * ```
 */
export interface ExtractCompleteResponse {
    /** 基本文件和全局信息 */
    metadata: Metadata;

    /** 選中縮圖片段的時間範圍資訊 */
    thumbnail_metadata: ThumbnailMetadata;

    /** 完整曲子的全局風險特徵 */
    global_risk_features: GlobalRiskFeatures;

    /** 縮圖片段的預測特徵 */
    thumbnail_prediction_features: ThumbnailPredictionFeatures;

    /** 縮圖片段的驗證時序陣列 */
    thumbnail_validation_arrays: ThumbnailValidationArrays;

    /** 完整曲子的包絡線特徵 @4Hz */
    full_features: FullFeatures;

    /** 前後 15 秒的平滑度指標 */
    smoothness: Smoothness;
}

/**
 * 使用範例
 */
export const EXAMPLE_RESPONSE: ExtractCompleteResponse = {
    metadata: {
        filename: "1100.mp3",
        full_duration_seconds: 308.96,
        global_confidence_avg: 0.6187382268491136,
    },
    thumbnail_metadata: {
        thumbnail_start_sec: 260.0,
        thumbnail_end_sec: 290.0,
        duration_seconds: 30.0,
    },
    global_risk_features: {
        mode: "Major",
        mode_score: 0.5252351399018401,
        pulse_clarity: 0.8057443703560406,
        tempo_category: "Moderate",
        tempo_bpm: 71.77734375,
        tempo_score: 0.588330078125,
        dynamic_range_db: 92.52503204345703,
        dynamic_range_normalized: 1.0,
        mean_loudness_db: -6.439234256744385,
        mean_f0_hz: 107.59896703584705,
        f0_range_hz: 270.05443827812644,
    },
    thumbnail_prediction_features: {
        mode_mean: 0.5210955739021301,
        pulse_clarity_mean: 0.8398729562759399,
        tempo_mean_bpm: 71.77734375,
        music_envelope_mean: 0.2631908357143402,
        music_envelope_std: 0.040472593158483505,
        f0_envelope_mean_hz: 90.9480972290039,
        loudness_envelope_mean: -4.229862213134766,
        loudness_stability: 0.4152996017462508,
    },
    thumbnail_validation_arrays: {
        sampling_rate_hz: 4.0,
        array_length: 120,
        music_envelope_4hz: [0.30383580923080444, 0.32676613330841064], // ... 120 samples total
        f0_envelope_4hz: [0.0, 0.0], // ... 120 samples total
        loudness_envelope_4hz: [-2.8719913959503174, -2.238816976547241], // ... 120 samples total
    },
    full_features: {
        f0_envelope_4hz: [0.0, 0.0, 169.31, 137.44], // ... 1236 samples total
        music_envelope_4hz: [0.0564, 0.1013, 0.0967], // ... 1236 samples total
        loudness_envelope_4hz: [-17.497, -12.413, -12.815], // ... 1236 samples total
    },
    smoothness: {
        head: {
            f0_mean: 130.09,
            music_mean: 0.1826,
            loudness_mean: -8.09,
        },
        tail: {
            f0_mean: 82.03,
            music_mean: 0.1005,
            loudness_mean: -23.21,
        },
    },
};

/**
 * 核心指標解釋
 * 
 * ## 速度指標
 * - **tempo_bpm**: 每分鐘拍數（BPM），範圍一般 30-300
 * - **tempo_category**: 人類可感知的速度類別
 *   - Slow: < 60 BPM (悠閒、緩和)
 *   - Moderate: 60-99 BPM (自然步伐、常見)
 *   - Fast: ≥ 100 BPM (活力、激動)
 * 
 * ## 脈動清晰度
 * - **pulse_clarity** (0-1): 節奏規律性程度
 *   - 0.0-0.3: 低規律性（例：無節奏的環境音樂 ambient）
 *   - 0.3-0.6: 中規律性（例：搖籃曲 lullaby）
 *   - 0.6-0.9: 高規律性（例：電子舞曲 EDM、流行歌）
 *   - 0.9-1.0: 完美規律性（例：節拍器、合成鼓）
 * 
 * ## 調式
 * - **mode**: 調式類別 (Major/Minor/Unknown)
 * - **mode_score**: 調式判別信心度
 * 
 * ## 響度動態
 * - **mean_loudness_db**: 平均感知響度（dB）
 *   - 典型範圍：-30 到 0 dB
 *   - 值越接近 0，音樂越響
 * - **dynamic_range_db**: 最大和最小響度的差值
 * - **loudness_stability**: 響度波動程度 (0=穩定，1=波動大)
 * 
 * ## 基頻特徵
 * - **mean_f0_hz**: 平均基頻（Hz）
 *   - 男聲一般 80-180 Hz
 *   - 女聲一般 150-250 Hz
 * - **f0_range_hz**: 基頻變化幅度
 * 
 * ## 完整特徵 (full_features)
 * - 提供完整曲子的 4Hz 採樣包絡線
 * - 可用於繪製時序圖表或進行進階分析
 * 
 * ## 平滑度指標 (smoothness)
 * - head: 前 15 秒的統計特徵（歌曲開場）
 * - tail: 後 15 秒的統計特徵（歌曲結尾）
 * - 適用於偵測歌曲結構變化（例：從 intro 到 chorus 的轉變）
 */
