
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