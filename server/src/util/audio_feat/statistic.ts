import type { StatisticFeatures } from "../../types/metrix";

export function statistic(envelope: number[]): StatisticFeatures {
    const n = envelope.length;

    if (n === 0)
        return { mean: 0, median: 0, std: 0, min: 0, max: 0, skewness: 0, kurtosis: 0 };

    const mean = envelope.reduce((a, b) => a + b, 0) / n;
    const sorted = [...envelope].sort((a, b) => a - b);
    const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    const std = Math.sqrt(envelope.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    const min = Math.min(...envelope);
    const max = Math.max(...envelope);

    // Skewness
    const skewness = envelope.reduce((a, b) => a + ((b - mean) / std) ** 3, 0) / n;

    // Kurtosis
    const kurtosis = envelope.reduce((a, b) => a + ((b - mean) / std) ** 4, 0) / n;

    return { mean, median, std, min, max, skewness, kurtosis };
}