/**
 * Audio Feature Extractor API 抽象接口
 * 与 Python extractor_server 通信的类型定义
 */

// ============================================
// 共享类型
// ============================================

export interface AudioMetadata {
    filename: string;
    duration_sec: number;
    sample_rate_hz?: number;
    total_points?: number;
    hop_length?: number;
    extraction_time_ms?: number;
}

// ============================================
// 1. 完整医疗级特征提取端点
// ============================================

export interface ExtractCompleteRequest {
    file?: File | Blob;
    filePath?: string;
    thumbnail_duration?: number; // 默认 25.0 秒
    min_duration?: number; // 默认 20.0 秒
    max_duration?: number; // 默认 30.0 秒
}

export interface GlobalRiskFeatures {
    tempo_bpm: number;
    tempo_confidence: number;
    pulse_clarity: number;
    mode: string;
    mode_confidence: number;
    loudness_mean: number;
    loudness_std: number;
    loudness_dynamic_range: number;
    chroma_flux_mean: number;
    chroma_flux_std: number;
    global_confidence_avg: number;
    [key: string]: any;
}

export interface ThumbnailPredictionFeatures {
    hr_mean: number;
    hr_std: number;
    rmssd_mean: number;
    rmssd_std: number;
    sdnn_mean: number;
    sdnn_std: number;
    pnn50_mean: number;
    pnn50_std: number;
    loudness_mean: number;
    loudness_std: number;
    chroma_flux_mean: number;
    chroma_flux_std: number;
    [key: string]: any;
}

export interface ThumbnailValidationArrays {
    hr: number[];
    rmssd: number[];
    sdnn: number[];
    pnn50: number[];
    loudness: number[];
    chroma_flux: number[];
    [key: string]: number[];
}

export interface ThumbnailMetadata {
    thumbnail_start_sec: number;
    thumbnail_end_sec: number;
    duration_seconds: number;
}

export interface Smoothness {
    [key: string]: number;
}

export interface FullFeatures {
    [key: string]: any;
}

export interface ExtractCompleteResponse {
    metadata: {
        filename: string;
        full_duration_seconds: number;
        global_confidence_avg: number;
    };
    thumbnail_metadata: ThumbnailMetadata;
    global_risk_features: GlobalRiskFeatures;
    thumbnail_prediction_features: ThumbnailPredictionFeatures;
    thumbnail_validation_arrays: ThumbnailValidationArrays;
    full_features: FullFeatures;
    smoothness: Smoothness;
}

// ============================================
// 2. 原始特征时间线端点
// ============================================

export interface ExtractTimelinesRequest {
    file?: File | Blob;
    filePath?: string;
}

export interface TimelineData {
    loudness: number[];
    chroma_matrix: number[][]; // shape (n_points, 12)
    chroma_flux: number[];
}

export interface ExtractTimelinesResponse {
    timelines: TimelineData;
    metadata: AudioMetadata & {
        filename: string;
        target_hz: number;
        hop_length_source: number;
    };
}

// ============================================
// 3. 节奏和脉冲清晰度端点
// ============================================

export interface ExtractTempoPulseRequest {
    file?: File | Blob;
    filePath?: string;
    start_sec?: number | null;
    end_sec?: number | null;
}

export interface ExtractTempoPulseResponse {
    tempo_bpm: number;
    tempo_confidence: number; // [0, 1]
    pulse_clarity: number; // [0, 1]
    duration_sec: number;
    metadata: {
        filename: string;
        start_sec: number;
        end_sec: number;
        extraction_time_ms: number;
    };
}

// ============================================
// Audio Extractor API 客户端接口
// ============================================

export interface IExtractorClient {
    /**
     * 提取原始特征时间线（低级特征，用于后续应用）
     * 返回：
     * - Loudness: dB 单位的平滑响度
     * - Chroma: 12 维色度矩阵 + 色度通量
     * - 所有特征重采样到 4Hz
     */
    extractTimelines(
        request: ExtractTimelinesRequest
    ): Promise<ExtractTimelinesResponse>;

    /**
     * 计算节奏（Tempo）和脉冲清晰度（Pulse Clarity）
     * - Tempo: 曲线中最稳定的周期性 → BPM
     * - Pulse Clarity: 自相关峰值 → [0, 1] 清晰度指标
     */
    extractTempoPulse(
        request: ExtractTempoPulseRequest
    ): Promise<ExtractTempoPulseResponse>;
}

// ============================================
// 实现客户端类
// ============================================

export class ExtractorAPIClient implements IExtractorClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, ""); // 移除尾部斜杠
    }


    async extractTimelines(
        request: ExtractTimelinesRequest
    ): Promise<ExtractTimelinesResponse> {
        // 验证参数
        if (!request.file && !request.filePath) {
            throw new Error("Either 'file' or 'filePath' must be provided");
        }

        const formData = new FormData();

        if (request.file) {
            formData.append("file", request.file);
        } else {
            formData.append("file_path", request.filePath!);
        }

        const response = await fetch(`${this.baseUrl}/extract/timelines`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const error: any = await response.json();
            throw new Error(
                `Extract timelines failed: ${error.detail || response.statusText}`
            );
        }

        return response.json() as Promise<ExtractTimelinesResponse>;
    }

    async extractTempoPulse(
        request: ExtractTempoPulseRequest
    ): Promise<ExtractTempoPulseResponse> {
        // 验证参数
        if (!request.file && !request.filePath) {
            throw new Error("Either 'file' or 'filePath' must be provided");
        }

        const formData = new FormData();

        if (request.file) {
            formData.append("file", request.file);
        } else {
            formData.append("file_path", request.filePath!);
        }

        if (request.start_sec !== undefined && request.start_sec !== null) {
            formData.append("start_sec", request.start_sec.toString());
        }
        if (request.end_sec !== undefined && request.end_sec !== null) {
            formData.append("end_sec", request.end_sec.toString());
        }

        const response = await fetch(`${this.baseUrl}/extract/tempo_pulse`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const error: any = await response.json();
            throw new Error(
                `Extract tempo pulse failed: ${error.detail || response.statusText}`
            );
        }

        return response.json() as Promise<ExtractTempoPulseResponse>;
    }
}
