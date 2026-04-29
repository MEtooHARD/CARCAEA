/**
 * Audio Handler: Extract & Store Timelines
 * 
 * 從 extractor service 取得 timelines 並存入 base_audio_features 表
 */

import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { db, type AudioHandler } from './scan';
import type { ChromaMatrix } from '../types/metrix';

// ============================================================================
// 類型定義
// ============================================================================

interface ExtractTimelinesResponse {
    timelines: {
        loudness_db: number[];
        chroma_matrix: number[][];
        chroma_flux: number[];
    };
    metadata: {
        duration_sec: number;
        sample_rate_hz: number;
        target_hz: number;
        total_points: number;
        extraction_time_ms: number;
    };
}

// ============================================================================
// Extractor 客戶端
// ============================================================================

/** 從 extractor service 取得 timelines */
async function getTimelinesFromExtractor(filePath: string): Promise<ExtractTimelinesResponse> {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    try {
        const response = await axios.post<ExtractTimelinesResponse>(
            'http://localhost:5000/extract/timelines',
            form,
            {
                headers: form.getHeaders(),
                timeout: 120000  // 120 秒超時
            }
        );

        return response.data;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Extractor request failed: ${errorMsg}`);
    }
}

// ============================================================================
// Handler 實現
// ============================================================================

/**
 * Handler: 從 extractor 取得 timelines 並儲存到資料庫
 * 
 * @param filePath 音訊檔案路徑
 * @param trackId track id
 */
export const extractAndStoreTimelines: AudioHandler = async (
    filePath: string,
    trackId: string
) => {
    console.log(`   ⏳ Extracting timelines...`);

    try {
        // 1. 從 extractor 取得 timelines
        const response = await getTimelinesFromExtractor(filePath);
        const { timelines, metadata } = response;

        // 2. 驗證資料
        if (!timelines.loudness_db || !timelines.chroma_matrix || !timelines.chroma_flux) {
            throw new Error('Invalid extractor response: missing timelines data');
        }

        if (timelines.loudness_db.length !== timelines.chroma_matrix.length) {
            throw new Error(
                `Timeline length mismatch: loudness (${timelines.loudness_db.length}) ` +
                `vs chroma_matrix (${timelines.chroma_matrix.length})`
            );
        }

        console.log(`      Duration: ${metadata.duration_sec.toFixed(1)}s`);
        console.log(`      Sample rate: ${metadata.sample_rate_hz} Hz`);
        console.log(`      Target rate: ${metadata.target_hz} Hz`);
        console.log(`      Points: ${metadata.total_points}`);
        console.log(`      Extraction time: ${metadata.extraction_time_ms}ms`);

        // 3. 儲存到 base_audio_features
        await db
            .insertInto('base_audio_features')
            .values({
                track_id: trackId,
                sr_hz: metadata.sample_rate_hz,
                len: metadata.total_points,
                chroma_matrix: timelines.chroma_matrix as ChromaMatrix[],
                loudness_db: timelines.loudness_db,
                chroma_flux: timelines.chroma_flux,
                timestamp: new Date()
            })
            .onConflict((oc) =>
                oc.column('track_id').doUpdateSet({
                    sr_hz: metadata.sample_rate_hz,
                    len: metadata.total_points,
                    chroma_matrix: timelines.chroma_matrix as ChromaMatrix[],
                    loudness_db: timelines.loudness_db,
                    chroma_flux: timelines.chroma_flux,
                    timestamp: new Date()
                })
            )
            .execute();

        console.log(`      ✅ Stored in base_audio_features`);

        // 4. 更新 track 表的 duration_s
        await db
            .updateTable('track')
            .set({ duration_s: metadata.duration_sec })
            .where('id', '==', trackId)
            .execute();

        console.log(`      ✅ Updated track duration`);

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to extract and store timelines: ${errorMsg}`);
    }
};

export default extractAndStoreTimelines;
