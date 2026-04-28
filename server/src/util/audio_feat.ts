/**
 * Audio Feature Processing & SSM Thumbnailing
 * 
 * 流程：
 * 1. 響度標準化 (Min-Max Normalization)
 * 2. 計算加權 SSM (Loudness-weighted + Transposition Invariance)
 * 3. 對角線平滑化 (Diagonal Smoothing)
 * 4. 閾值懲罰 (Thresholding with Penalty)
 * 5. 滑動視窗尋找縮圖 (30sec Thumbnail Extraction)
 */

import type { ChromaMatrix } from "../core/import";
import { diagonal_smooth, L2, MinMax } from "./math";

// ============================================================================
// 📋 類型定義
// ============================================================================

export interface ThumbnailResult {
    start_frame: number;        // 縮圖開始幀
    end_frame: number;          // 縮圖結束幀
    start_sec: number;    // 縮圖開始時間 (秒)
    end_sec: number;      // 縮圖結束時間 (秒)
    score: number;        // 適應度分數
    coverage: number;     // 涵蓋率 [0, 1]
}

export interface SSMConfig {
    smoothingWindow: number;      // 對角線平滑窗 (幀), 默認 8 = 2 秒 @ 4Hz
    threshold: number;            // 相似度閾值, 默認 0.5
    penalty: number;              // 低於閾值的懲罰值, 默認 -1.0
    thumbnailDuration: number;    // 縮圖長度 (秒), 默認 30
    samplingRate: number;         // 採樣率 (Hz), 默認 4
}

const DEFAULT_CONFIG: SSMConfig = {
    smoothingWindow: 8,
    threshold: 0.5,
    penalty: -1.0,
    thumbnailDuration: 30,
    samplingRate: 4,
};

// ============================================================================
// 2️⃣ 步驟二：計算加權 SSM (Loudness-weighted + Transposition Invariance)
// ============================================================================

/** 計算轉調不變的餘弦相似度 (嘗試 12 種循環移位，取最高值) */
function computeTranspositionInvariantSimilarity(
    chromaI: ChromaMatrix,
    chromaJ: ChromaMatrix,
    normI: number,
    normJ: number
): number {
    let maxSimilarity = -Infinity;

    for (let shift = 0; shift < 12; shift++) {
        let dotProduct = 0;
        for (let k = 0; k < 12; k++) {
            dotProduct += chromaI[k] * chromaJ[(k + shift) % 12];
        }
        const similarity = dotProduct / (normI * normJ);
        maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    return maxSimilarity;
}

/** 計算 Self-Similarity Matrix (轉調不變性+餘弦相似度) */
export function chromaSSM(chroma_matrix: ChromaMatrix[]): number[][] {
    const N = chroma_matrix.length;
    const ssm = Array.from({ length: N }, () => new Array(N).fill(0));
    const C_len = chroma_matrix.map(L2);

    for (let i = 0; i < N; i++) {
        for (let j = i; j < N; j++) {
            const cosineSim = computeTranspositionInvariantSimilarity(
                chroma_matrix[i],
                chroma_matrix[j],
                C_len[i],
                C_len[j]
            );
            ssm[i][j] = cosineSim;
            ssm[j][i] = cosineSim;
        }
    }
    return ssm;
}

// ============================================================================
// 輔助函數
// ============================================================================

/** 計算視窗的適應度分數與涵蓋率 */
export function computeFitnessScore(
    smoothedSSM: number[][],
    windowStart: number,
    windowSize: number
): { score: number; coverage: number } {
    const N = smoothedSSM.length;
    let totalScore = 0;
    let activeFrames = 0;

    for (let row = windowStart; row < windowStart + windowSize; row++) {
        if (row >= N) break;
        for (let col = 0; col < N; col++) {
            const val = smoothedSSM[row][col];
            if (val > 0) {
                totalScore += val;
                activeFrames++;
            }
        }
    }

    const totalCells = windowSize * N;
    const coverage = activeFrames / (totalCells + 1e-10);
    return { score: totalScore, coverage };
}

/** 用滑動視窗在 SSM 上尋找最高分的固定長度片段 */
export function findThumbnail(
    smoothedSSM: number[][],
    config: SSMConfig = DEFAULT_CONFIG
): ThumbnailResult {
    const N = smoothedSSM.length;
    const windowFrames = Math.round(config.thumbnailDuration * config.samplingRate);

    if (windowFrames > N)
        throw new Error(`Thumbnail duration (${windowFrames} frames) exceeds total length (${N} frames)`);

    let maxScore = -Infinity;
    let bestStart = 0;
    let bestCoverage = 0;

    for (let i = 0; i <= N - windowFrames; i++) {
        const { score, coverage } = computeFitnessScore(smoothedSSM, i, windowFrames);
        if (score > maxScore) {
            maxScore = score;
            bestStart = i;
            bestCoverage = coverage;
        }
    }

    const bestEnd = bestStart + windowFrames;
    return {
        start_frame: bestStart,
        end_frame: bestEnd,
        start_sec: bestStart / config.samplingRate,
        end_sec: bestEnd / config.samplingRate,
        score: maxScore,
        coverage: bestCoverage,
    };
}

/** 產生診斷數據 (響度與 Chroma 的統計資訊) */
export function generateSSMDiagnostics(
    chromaMatrix: number[][],
    loudness: number[]
): {
    loudnessStats: { min: number; max: number; mean: number };
    chromaStats: { min: number; max: number; mean: number };
} {
    const loudnessStats = {
        min: Math.min(...loudness),
        max: Math.max(...loudness),
        mean: loudness.reduce((a, b) => a + b, 0) / loudness.length,
    };

    const flatChroma = chromaMatrix.flat();
    const chromaStats = {
        min: Math.min(...flatChroma),
        max: Math.max(...flatChroma),
        mean: flatChroma.reduce((a, b) => a + b, 0) / flatChroma.length,
    };

    return { loudnessStats, chromaStats };
}

// ============================================================================
// 🎯 完整的 SSM Thumbnailing Pipeline
// ============================================================================

/**
 * 完整的 SSM Thumbnailing Pipeline
 * 
 * 流程：
 * 1️⃣ 輸入驗證 (維度、長度)
 * 2️⃣ 計算基礎 SSM (Transposition Invariant Cosine Similarity)
 * 3️⃣ 標準化響度到 [0, 1] (Min-Max Normalization)
 * 4️⃣ 加入響度雙向權重: SSM[i,j] *= L_norm[i] * L_norm[j]
 * 5️⃣ 對角線平滑化 (Diagonal Smoothing, 2 秒窗)
 * 6️⃣ 閾值懲罰 (低於 threshold 的分數設為 penalty)
 * 7️⃣ 滑動窗口尋找最高分縮圖 (30 秒)
 */
export function extractThumbnail(
    chromaMatrix: ChromaMatrix[],
    loudness: number[],
    config: Partial<SSMConfig> = {}
): ThumbnailResult {
    const finalConfig: SSMConfig = { ...DEFAULT_CONFIG, ...config };

    // 驗證輸入
    if (chromaMatrix.length === 0 || loudness.length === 0) throw new Error('Empty chroma matrix or loudness array');

    if (chromaMatrix.length !== loudness.length)
        throw new Error(`Length mismatch: chromaMatrix (${chromaMatrix.length}) vs loudness (${loudness.length})`);

    if (chromaMatrix[0].length !== 12)
        throw new Error(`Chroma matrix must have 12 dimensions, got ${chromaMatrix[0].length}`);

    console.log(`🎵 SSM Thumbnailing Pipeline`);
    console.log(`   - Input: ${chromaMatrix.length} frames`);
    console.log(`   - Duration: ${(chromaMatrix.length / finalConfig.samplingRate).toFixed(1)}s`);

    // 步驟 1-2: 計算基礎 SSM (含轉調不變性)
    console.log(`⏳ Step 1: Computing transposition-invariant SSM...`);
    const SSM = chromaSSM(chromaMatrix);

    const penalizedSSM = SSM.map(row =>
        row.map(val => (val < finalConfig.threshold ? finalConfig.penalty : val))
    );

    // 步驟 3-4: 標準化響度並套用雙向權重
    console.log(`⏳ Step 2: Normalizing loudness and weighting...`);
    const L_norm = MinMax(loudness);
    const L_weighted_SSM = penalizedSSM.map(
        (row, i) => row.map(
            (val, j) => val * L_norm[i] * L_norm[j]
        )
    );

    // 步驟 5-6: 對角線平滑 + 閾值懲罰
    console.log(`⏳ Step 3: Diagonal smoothing and thresholding...`);
    const smoothedSSM = diagonal_smooth(L_weighted_SSM, finalConfig.smoothingWindow);

    // 步驟 7: 滑動視窗尋找縮圖
    console.log(`⏳ Step 4: Extracting thumbnail (${finalConfig.thumbnailDuration}s window)...`);
    const result = findThumbnail(smoothedSSM, finalConfig);

    console.log(`✅ Thumbnail extracted:`);
    console.log(`   - Segment: ${result.start_sec.toFixed(2)}s - ${result.end_sec.toFixed(2)}s`);
    console.log(`   - Score: ${result.score.toFixed(2)}`);
    console.log(`   - Coverage: ${(result.coverage * 100).toFixed(1)}%`);

    return result;
}
