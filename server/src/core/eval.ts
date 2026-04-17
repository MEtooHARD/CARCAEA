import type { SmoothnessMetrics } from "../types/extract_complete_response";
import type { HR_RMSSD_LFHF } from "../types/metrix";
import { freq_to_midi } from "../util/numeric";
import { cosineSimilarity, euclideanDistance } from "../util/pred";
import { HRV, HRVbase, type HRVset, type Predictor } from "./Constants";

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

export const Predictors: Record<HRV, Predictor> = {

    // ------------------------------------------------------------------------
    // HEART RATE (HR)
    // Structure: Base + 2 terms (Asymmetrical, strictly driven by entrainment & arousal)
    // ------------------------------------------------------------------------
    [HRV.HR]: ((T, L, F, Pc, Pi, M): number => (
        + (HRVbase[HRV.HR])

        /**
         * [Rhythmic Entrainment & Auditory-Motor Integration]
         * Theory: The synchronization of heart rate to musical tempo is the primary driver of HR.
         * The impact of tempo (T) is synergistically amplified by pulse clarity (Pc), 
         * as stronger beats provide more robust cues for cardiovascular entrainment.
         * 
         * Reference: 
         * - Juslin et al. (2024), "Rhythmic entrainment of heart rate as a mechanism for musical emotion induction..."
         */
        + (0.25 * (T - HRVbase[HRV.HR]) * (1 + Pc))

        /**
         * [Startle Reflex & Sympathetic Arousal]
         * Theory: Acoustic energy (Loudness, L) acts as a non-linear trigger for sympathetic arousal. 
         * Sound intensities above a background threshold (e.g., -40dB) rapidly accelerate HR.
         * 
         * Reference: 
         * - The Impact of Sound Exposure on Heart Rate (Literature context).
         * - Dalla Bella et al. (2001), "A developmental study of the affective value of tempo and mode in music"
         */
        + (0.4 * Math.max(0, L + 40))
    )),

    // ------------------------------------------------------------------------
    // RMSSD (Parasympathetic / Relaxation)
    // Structure: Base + 4 terms (Driven by cognitive load, musical mode, and energy)
    // ------------------------------------------------------------------------
    [HRV.RMSSD]: ((T, L, F, Pc, Pi, M): number => (
        + (HRVbase[HRV.RMSSD])

        /**
         * [Cognitive Load via F0 Envelope]
         * Theory: F0 Variance (F) dictates the melodic contour. High variance implies 
         * complex melodies, which increase cognitive load and disrupt the regular 
         * respiratory sinus arrhythmia (RSA), thereby suppressing RMSSD.
         * 
         * Reference: 
         * - Exploring the causal relationships between musical features and physiological 
         *   indicators of emotion (Nardelli et al., 2015 / Literature Context).
         */
        - (0.4 * F)

        /**
         * [Synergistic Vagal Suppression]
         * Theory: High loudness (L) combined with sharp percussion (Pc) creates an 
         * invasive acoustic environment that actively suppresses parasympathetic activity.
         * 
         * Reference: 
         * - Orini et al. (2010), "Continuous HRV tracking during music"
         */
        - (0.5 * Math.max(0, L + 40) * Pc)

        /**
         * [Mode Valence Effect for Relaxation]
         * Theory: Minor mode (M -> 0) is a well-documented characteristic of relaxing 
         * and sleep-inducing music, significantly contributing to vagal tone activation.
         * 
         * Reference: 
         * - Dickson & Schubert (2020), "Musical features that aid sleep"
         */
        - (8.0 * (M - 0.5))

        /**
         * [Tempo Penalty for Relaxation]
         * Theory: Music with a tempo significantly higher than the resting heart rate 
         * (e.g., > 80 bpm) prevents deep relaxation and decreases RMSSD.
         * 
         * Reference: 
         * - Dickson & Schubert (2020), "Musical features that aid sleep"
         */
        - (0.2 * Math.max(0, T - 80))
    )),

    // ------------------------------------------------------------------------
    // LF/HF (Sympathetic / Stress & Arousal)
    // Structure: Base + 4 terms (Driven by punchiness, staccato, F0 causal drive, and high pitch)
    // ------------------------------------------------------------------------
    [HRV.LFHF]: ((T, L, F, Pc, Pi, M): number => {
        const MIDI = freq_to_midi(Pi);

        return Math.log(
            + (HRVbase[HRV.LFHF])

            /**
             * [Synergistic Sympathetic Arousal (Punchiness)]
             * Theory: The interaction between loud intensity (L) and high beat salience (Pc) 
             * produces "punchiness", which strongly triggers the "Fight or Flight" response.
             * 
             * Reference: 
             * - Nardelli et al. (2015), "Exploring the causal relationships between musical 
             *   features and physiological indicators of emotion"
             */
            + (0.05 * Math.max(0, L + 40) * Pc)

            /**
             * [Staccato Effect / High-Arousal Pulse]
             * Theory: High pulse clarity (Pc > 0.1) indicates sharp, staccato rhythms 
             * that maintain sympathetic nervous system activation and cognitive alertness.
             * 
             * Reference: 
             * - Keller & Schubert (2011), "Cognitive and affective judgements of syncopated musical themes"
             */
            + (1.5 * Math.max(0, Pc - 0.1))

            /**
             * [Dynamic Causal Drive of F0 Envelope]
             * Theory: F0 Envelope variance (F) has been proven to possess a direct dynamic 
             * causal influence on the LF/HF stress ratio, independent of loudness.
             * 
             * Reference: 
             * - Exploring the causal relationships between musical features and physiological 
             *   indicators of emotion (Literature Context).
             */
            + (0.8 * F)

            /**
             * [High-Frequency / Spectral Tension]
             * Theory: Higher absolute pitch (Pi, measured in MIDI notes where Middle C = 60) 
             * introduces psychoacoustic tension, mildly elevating the stress index.
             * 
             * Reference: 
             * - Halbert et al. / Eerola (2012), "Modeling Listeners' Emotional Response to Music"
             */
            + (0.05 * (MIDI - 60))
        )
    })
};


export function psycho_distance(target: HRVset, reference: HRVset) { }; 