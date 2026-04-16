
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
