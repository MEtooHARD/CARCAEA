// ### 1. 預設靜息心率 (Baseline HR)
// *   **文獻基準值：`約 60 ~ 70 bpm`**
// *   **文獻來源：** 
//     *   在 Gil 等人 (2010) 的傾斜床實驗中，健康受試者在平躺靜息（Supine）狀態下的平均 NN 間距為 $0.988 \pm 0.195$ 秒。換算成心率約為 **60.7 bpm**。

import type { NumRange } from "../util/numeric";

//     *   在另一份探討心衰竭與健康受試者非線性特徵的對照研究中，健康組的平均 RR 間距為 $855.74 \pm 56.14$ 毫秒，換算成心率約為 **70.1 bpm**。
export const DEFAULT_HEART_RATE = 65; // bpm

// ### 2. 預設靜息副交感指標 (Baseline RMSSD)
// *   **文獻基準值：`約 43 ~ 49 ms (毫秒)`**
// *   **文獻來源：**
//     *   Gil 等人的研究指出，平躺靜息時的 RMSSD 平均為 $0.049 \pm 0.028$ 秒（即 **49 ms**）；當切換到直立高壓狀態時，下降至 $0.036 \pm 0.025$ 秒（即 36 ms）。
//     *   Valenza 等人的研究中，健康受試者的 RMSSD 為 $0.0432 \pm 0.0145$ 秒（即 **43.2 ms**）。
export const DEFAULT_RMSSD = 45; // ms

// ### 3. 預設靜息交感/迷走平衡指標 (Baseline LF/HF)
// *   **文獻基準值：`約 1.5 ~ 2.65`**
// *   **文獻來源：**
//     *   Gil 等人的研究記錄到，靜息狀態下的 LF/HF 比例為 **$2.652 \pm 1.834$**。當進入直立受壓狀態時，交感神經飆升，LF/HF 劇增至 $6.593 \pm 5.438$。
export const DEFAULT_LFHF = 2.07;

/**
 * Audio feature types extracted from music.
 * 
 * @enum {number}
 * @property {number} TEMPO - bpm (beats per minute)
 * @property {number} LOUDNESS - dB (decibels)
 * @property {number} F0_VARIANCE - variance, Hz
 * @property {number} PULSE_CLARITY - (0, 1)
 * @property {number} PITCH - (0, 1) => (minor, major)
 */
export enum AudioFeatures {
    /** bpm */
    TEMPO,
    /** dB */
    LOUDNESS,
    /** variance, Hz */
    F0_VARIANCE,
    /** (0, 1) */
    PULSE_CLARITY,
    /** (0, 1) => (minor, major) */
    PITCH
};

export enum HRV { HR, RMSSD, LFHF };

export type HRVset = Record<HRV, number>;

export type Predictor = (T: number, L: number, F_var: number, Pc: number, Pi: number, M: number) => number;


export const HRVbase: Record<HRV, number> = {
    [HRV.HR]: 65, // bpm
    [HRV.RMSSD]: 45, // ms
    [HRV.LFHF]: 2
};

/** The standard deviations for each HRV metric */
export const HRV_LOG_STD: Record<HRV, number> = {
    [HRV.HR]: 15, // bpm
    [HRV.RMSSD]: 0.8, // ln(ms)
    [HRV.LFHF]: 0.7
}

export const HRV_PHYCHO_IMPORTANCE: Record<HRV, number> = {
    [HRV.HR]: 1.5,
    [HRV.RMSSD]: 1.0,
    [HRV.LFHF]: 6.0
}

export const HRVRange: Record<HRV, NumRange> = {
    [HRV.HR]: { min: 40, max: 210 },
    [HRV.RMSSD]: { min: 5, max: 150 },
    [HRV.LFHF]: { min: 0.1, max: 20 }
}

export const HRRadius = 10;
export const RMSSDRadius = 10;
export const LFHFRadius = 2;