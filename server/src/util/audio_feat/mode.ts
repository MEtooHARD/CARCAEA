/**
 * Mode (調性) 計算
 * 
 * 基於 Chroma 特徵計算調性分數：
 * - 1.0 = 純大調（明亮、積極）
 * - 0.5 = 大小調等值
 * - 0.0 = 純小調（陰鬱、緊張）
 */

import type { ChromaMatrix } from "../../types/metrix";
import { cos_sim, cyclic_shift } from "../math";

// ============================================================================
// 二元範本定義
// ============================================================================

/**
 * 大調基礎範本 (C 大調)
 * 組成音：C (0), E (4), G (7)
 */
const MAJOR_TEMPLATE: number[] = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0];

/**
 * 小調基礎範本 (C 小調)
 * 組成音：C (0), D# (3), G (7)
 */
const MINOR_TEMPLATE: number[] = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0];

// ============================================================================
// 核心計算函數
// ============================================================================

/**
 * 計算平均 Chroma 向量
 * 
 * @param chromaMatrix Chroma 矩陣 [frames × 12]
 * @returns 平均 Chroma 向量 [12]
 */
export function mean_chroma(chromaMatrix: ChromaMatrix[]): ChromaMatrix {
    if (chromaMatrix.length === 0)
        return new Array(12).fill(0) as ChromaMatrix;

    const meanChroma: ChromaMatrix = new Array(12).fill(0) as ChromaMatrix;

    // sum of each chroma
    for (const chroma of chromaMatrix)
        for (let i = 0; i < 12; i++)
            meanChroma[i] += chroma[i];

    // mean
    for (let i = 0; i < 12; i++)
        meanChroma[i] /= chromaMatrix.length;

    return meanChroma;
}

/**
 * 計算所有 12 個調性的相似度分數（通用函數）
 * 
 * @param chroma 平均 Chroma 向量 [12]
 * @param template 調性範本 (MAJOR_TEMPLATE 或 MINOR_TEMPLATE)
 * @returns 12 個調性的分數陣列 [12]
 */
function score_to_mode(chroma: ChromaMatrix, template: number[]): number[] {
    const scores = new Array(12).fill(0);

    // 對 12 個調性循環計算相似度
    for (let shift = 0; shift < 12; shift++) {
        const shiftedTemplate = cyclic_shift(template, shift);
        scores[shift] = cos_sim(chroma, shiftedTemplate);
    }

    return scores;
}

/**
 * 計算調性分數 (Mode Score)
 * 
 * 算法：
 * 1. 計算平均 Chroma 向量
 * 2. 與 12 個大調模板計算相似度，取最大值
 * 3. 與 12 個小調模板計算相似度，取最大值
 * 4. mode_score = max_major / (max_major + max_minor)
 * 
 * 結果解讀：
 * - 1.0 = 純大調（明亮、積極）
 * - 0.5 = 大小調等值
 * - 0.0 = 純小調（陰鬱、緊張）
 * 
 * @param chromaMatrix Chroma 矩陣（縮圖時間段）[frames × 12]
 * @returns { mode_score, max_major_key, max_minor_key, scores }
 */
export function mode_score(chromaMatrix: ChromaMatrix[]): number {
    // [1] 計算平均 Chroma
    const meanChroma = mean_chroma(chromaMatrix);

    // [2] 計算所有大調分數
    const majorScores = score_to_mode(meanChroma, MAJOR_TEMPLATE);
    const maxMajorScore = Math.max(...majorScores);

    // [3] 計算所有小調分數
    const minorScores = score_to_mode(meanChroma, MINOR_TEMPLATE);
    const maxMinorScore = Math.max(...minorScores);

    // [4] 計算 Mode Score
    const denominator = maxMajorScore + maxMinorScore;
    const modeScore = denominator === 0 ? 0.5 : maxMajorScore / denominator;

    return modeScore;
}
