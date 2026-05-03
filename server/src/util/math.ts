
/**
 * 數值限制輔助函式，用於將數值鎖定在指定的安全範圍內
 * @param value 原始計算數值
 * @param min 容許下限
 * @param max 容許上限
 */
export function clamp(value: number, min: number = 0.0, max: number = 1.0): number {
    return Math.max(min, Math.min(max, value));
}

export function logarize(value: number, base: number = Math.E): number { return Math.log(value) / Math.log(base); }

export function logarize_pitch(pitch: number, min: number = 65, max: number = 1046): number {
    if (pitch <= 0) return 0;

    const logMin = logarize(min, 2);
    const logMax = logarize(max, 2);
    const logPitch = logarize(pitch, 2);

    return clamp((logPitch - logMin) / (logMax - logMin));
}

export interface NumRange { min: number, max: number };

export function MinMax(values: number[], r_threshold: number = 0): number[] {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    if (range <= r_threshold) return values.map(() => 0.5);

    return values.map(value => (value - min) / range);
}

/** L2 norm, or Euclidean distance */
export function L2(vec: number[]): number {
    return Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
}

export function diagonal_smooth(
    matrix: number[][],
    window_size: number
): number[][] {
    const N = matrix.length;
    if (matrix.some(row => row.length !== N))
        throw new Error('Input matrix must be square');

    const smoothed: number[][] = Array.from({ length: N }, () => Array(N).fill(0));

    for (let i = 0; i < N - window_size; i++)
        for (let j = 0; j < N - window_size; j++) {
            let sum = 0;
            for (let l = 0; l < window_size; l++)
                sum += matrix[i + l][j + l];
            smoothed[i][j] = sum / window_size;
        }

    return smoothed;
}

export function dot(a: number[], b: number[]): number {
    if (a.length !== b.length)
        throw new Error('Vectors must be of the same length');
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

export function cos_sim(a: number[], b: number[]): number {
    const normA = L2(a);
    const normB = L2(b);

    if (normA === 0 || normB === 0) return 0;

    return dot(a, b) / (normA * normB + 1e-10);
}

export function cyclic_shift(arr: number[], shift: number): number[] {
    const N = Math.round(shift % arr.length);
    return [...arr.slice(-N), ...arr.slice(0, -N)];
}

export function windowed_integrate(values: number[], window_size: number, step: number): number[] {
    const result: number[] = [];
    for (let i = 0; i + window_size <= values.length; i += step) {
        const window = values.slice(i, i + window_size);
        const sum = window.reduce((a, b) => a + b, 0);
        result.push(sum);
    }
    return result;
}

export function windowed_std(values: number[], window_size: number, step: number): number[] {
    const result: number[] = [];
    for (let i = 0; i + window_size <= values.length; i += step) {
        const window = values.slice(i, i + window_size);
        const mean = window.reduce((a, b) => a + b, 0) / window.length;
        const variance = window.reduce((sum, val) => sum + (val - mean) ** 2, 0) / window.length;
        const stdDev = Math.sqrt(variance);
        result.push(stdDev);
    }
    return result;
}

export function std(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

/**
 * 值 snapping：將相近的值替換成眾數或中位數
 * 用於平滑 tempo 等數值中的微小波動
 * 
 * @param values 輸入數組
 * @param tolerance 相近程度的容差（絕對差值）
 * @param minGroupSize 最小聚類大小（只有聚類包含此數量以上的值才進行替換）
 * @returns snapping 後的數組
 * 
 * 例如：tempo [120, 119.8, 120.1, 119.9, 120.2] 在 tolerance=1 時會變成 [120, 120, 120, 120, 120]
 */
export function snap_values(
    values: number[],
    tolerance: number = 1.0,
    minGroupSize: number = 2
): number[] {
    if (values.length === 0) return values;
    if (values.length === 1) return values;

    const result = [...values];
    const processed = new Set<number>(); // 記錄已處理的索引

    for (let i = 0; i < values.length; i++) {
        if (processed.has(i)) continue;

        // 找所有在 tolerance 範圍內的相鄰值
        const group: { index: number; value: number }[] = [{ index: i, value: values[i] }];
        for (let j = i + 1; j < values.length; j++) {
            if (Math.abs(values[j] - values[i]) <= tolerance) {
                group.push({ index: j, value: values[j] });
            }
        }

        // 如果聚類足夠大，計算代表值並替換
        if (group.length >= minGroupSize) {
            // 計算中位數
            const sortedValues = group.map(g => g.value).sort((a, b) => a - b);
            const median = sortedValues.length % 2 === 0
                ? (sortedValues[sortedValues.length / 2 - 1] + sortedValues[sortedValues.length / 2]) / 2
                : sortedValues[Math.floor(sortedValues.length / 2)];

            // 用中位數替換所有聚類中的值
            for (const item of group) {
                result[item.index] = median;
                processed.add(item.index);
            }
        }
    }

    return result;
}

/**
 * 高級 snapping：支持多輪迭代，逐步收斂
 * 
 * @param values 輸入數組
 * @param tolerance 相近程度的容差
 * @param minGroupSize 最小聚類大小
 * @param maxIterations 最多迭代次數
 * @returns 多輪迭代後的結果
 */
export function snap_values_iterative(
    values: number[],
    tolerance: number = 1.0,
    minGroupSize: number = 2,
    maxIterations: number = 3
): number[] {
    let result = [...values];
    for (let iter = 0; iter < maxIterations; iter++) {
        const newResult = snap_values(result, tolerance, minGroupSize);
        // 如果沒有變化，提前停止
        if (JSON.stringify(newResult) === JSON.stringify(result)) break;
        result = newResult;
    }
    return result;
}

/**
 * 計算眾數（最常見的值）
 * 如果有多個眾數，返回最小的那個
 * @param values 輸入數組（應為 rounded/snapped 值）
 * @returns 眾數
 */
export function mode(values: number[]): number {
    if (values.length === 0) return 0;
    
    const freq = new Map<number, number>();
    for (const v of values) {
        const rounded = Math.round(v * 10) / 10; // 1 decimal place
        freq.set(rounded, (freq.get(rounded) ?? 0) + 1);
    }
    
    return Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
}