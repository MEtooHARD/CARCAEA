

import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { readdir, readFile, stat, writeFile } from 'fs/promises';
import { Kysely, PostgresDialect } from 'kysely';
import { basename, join } from 'path';
import { Pool } from 'pg';
import mm from 'musicmetadata';
import { HRV } from './core/Constants.ts';
import { Predictors } from './core/eval.ts';
import { result, try_catch, type Result } from './types/Result.ts';
import type { DB, Track, TrackGlobalRisks, TrackHrvEffPredict, TrackPlatform, TrackPredictionsMeta, TrackValidationArrays } from './types/database_schema.ts';



const existed = new Set<number>(); // stores jamendo id


// ExtractCompleteResponse type based on extractor server response structure
interface ExtractCompleteResponse {
    metadata: {
        filename: string;
        full_duration_seconds: number;
        global_confidence_avg: number;
    };
    thumbnail_metadata: {
        thumbnail_start_sec: number;
        thumbnail_end_sec: number;
        duration_seconds: number;
    };
    global_risk_features: {
        mode: 'major' | 'minor';
        mode_score: number;
        pulse_clarity: number;
        tempo_category: 'slow' | 'moderate' | 'fast';
        tempo_bpm: number;
        dynamic_range_db: number;
        mean_loudness_db: number;
        mean_f0_hz: number;
        f0_range_hz: number;
    };
    thumbnail_prediction_features: {
        tempo_mean_bpm: number;
        loudness_envelope_mean: number;
        pulse_clarity_mean: number;
        f0_envelope_mean_hz: number;
        mode_mean: number;
        music_envelope_mean: number;
        music_envelope_std: number;
        loudness_stability: number;
        // F0 MIDI features
        f0_midi_mean: number;
        f0_midi_variance: number;
        f0_midi_std: number;
    };
    thumbnail_validation_arrays: {
        sampling_rate_hz: number;
        array_length: number;
        music_envelope_4hz: number[];
        f0_envelope_4hz: number[];  // ← extractor 返回的字段名
        loudness_envelope_4hz: number[];
    };
    full_features: Record<string, any>;
    smoothness: Record<string, any>;
}

const EXTRACTOR_BASE_URL = 'http://127.0.0.1:3002';
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'];

const dialect = new PostgresDialect({
    pool: new Pool({
        host: 'localhost',
        database: 'arcaea',
        user: 'admin',
        port: 5433,
        password: '1234'
    })
})

export const db = new Kysely<DB>({
    dialect,
})

/**
 * 從音訊檔案匯入單一歌曲
 * 
 * @param filePath - 音訊文件路徑
 * @returns 成功則返回 track_id，跳過則返回 skipped: true，失敗則返回 error
 */
export async function import_track(filePath: string): Promise<Result<string> & { skipped?: boolean; skipReason?: string }> {
    try {
        // Step 0: 先從檔案名稱提取 jamendo id，檢查是否已存在（避免讀取大文件）
        const filename = basename(filePath);
        const platform_id = filename.replace(/\.[^.]+$/, ''); // 移除副檔名
        const jamendoIdNum = Number(platform_id);

        if (existed.has(jamendoIdNum)) {
            return { data: null, error: null as any, skipped: true, skipReason: 'already_exists' };
        }

        // Step 1a: 讀取元數據獲取時長，如果 >10分鐘直接跳過
        try {
            const stream = createReadStream(filePath);
            const metadata = await new Promise<any>((resolve, reject) => {
                mm(stream, { duration: true }, (err, metadata) => {
                    if (err) reject(err);
                    else resolve(metadata);
                });
            });
            const durationSeconds = metadata.format?.duration ?? 0;

            if (durationSeconds > 600) {
                return { data: null, error: null as any, skipped: true, skipReason: 'duration_exceeded' };
            }
        } catch (error) {
            console.warn(`  ⚠️  無法讀取元數據: ${filename}`, error);
            // 繼續處理，假設文件有效
        }

        // Step 1: 讀取音訊文件
        const audioBuffer = await readFile(filePath);


        // Step 2: 呼叫 extractor server
        const formData = new FormData();
        formData.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), filename);
        formData.append('thumbnail_duration', '25.0');
        formData.append('min_duration', '20.0');
        formData.append('max_duration', '30.0');

        const extractRes = await fetch(`${EXTRACTOR_BASE_URL}/extract/complete`, {
            method: 'POST',
            body: formData,
        });

        if (!extractRes.ok) {
            const errorText = await extractRes.text();
            console.error(`  ⚠️  狀態碼: ${extractRes.status}`);
            console.error(`  ⚠️  錯誤詳情:`, errorText);
            return { data: null, error: new Error(`Extractor server error: ${extractRes.statusText} - ${errorText}`) };
        }

        const extractData = await extractRes.json() as ExtractCompleteResponse;

        // 驗證 validation_arrays 字段
        if (!extractData.thumbnail_validation_arrays.f0_envelope_4hz ||
            extractData.thumbnail_validation_arrays.f0_envelope_4hz.length === 0) {
            console.warn(`  ⚠️  警告: f0_envelope_4hz 为空或不存在`);
        }

        // Step 3: 生成隨機 track_id
        const track_id = randomUUID();

        // Step 4: 準備要插入的資料
        const trackData: Track = {
            id: track_id,
            name: platform_id,
            duration_s: extractData.metadata.full_duration_seconds,
            global_confidence: extractData.metadata.global_confidence_avg,
            thumbnail_start: extractData.thumbnail_metadata.thumbnail_start_sec,
            thumbnail_end: extractData.thumbnail_metadata.thumbnail_end_sec,
            thumbnail_duration: extractData.thumbnail_metadata.duration_seconds,
        };

        const trackPlatformData: TrackPlatform = {
            track_id,
            platform: 'jamendo',
            platform_id,
        };

        const globalRisksData: TrackGlobalRisks = {
            track_id,
            mode: extractData.global_risk_features.mode === 'major' ? 'major' : 'minor',
            mode_score: extractData.global_risk_features.mode_score,
            pulse_clarity: extractData.global_risk_features.pulse_clarity,
            tempo_category: extractData.global_risk_features.tempo_category === 'slow' ? 'slow'
                : extractData.global_risk_features.tempo_category === 'fast' ? 'fast' : 'moderate',
            tempo_bpm: extractData.global_risk_features.tempo_bpm,
            tempo_score: 0.5, // TODO: 計算或從 extractor 獲取
            dynamic_range_db: extractData.global_risk_features.dynamic_range_db,
            mean_loudness_db: extractData.global_risk_features.mean_loudness_db,
            mean_f0_hz: extractData.global_risk_features.mean_f0_hz,
            f0_range_hz: extractData.global_risk_features.f0_range_hz,
        };

        // Step 4a: 計算 Predictor 所需的參數
        const T = extractData.thumbnail_prediction_features.tempo_mean_bpm;
        const L = extractData.thumbnail_prediction_features.loudness_envelope_mean;
        const F = extractData.thumbnail_prediction_features.f0_midi_variance;
        const Pc = extractData.thumbnail_prediction_features.pulse_clarity_mean;
        const Pi = extractData.thumbnail_prediction_features.f0_envelope_mean_hz;
        const M = extractData.thumbnail_prediction_features.mode_mean;

        // Step 4b: 調用 Predictors 計算 HRV 值
        const hrPredictor = Predictors[HRV.HR];
        const rmssdPredictor = Predictors[HRV.RMSSD];
        const lfhfPredictor = Predictors[HRV.LFHF];

        const HR = hrPredictor(T, L, F, Pc, Pi, M);
        const RMSSD = rmssdPredictor(T, L, F, Pc, Pi, M);
        const LFHF = lfhfPredictor(T, L, F, Pc, Pi, M);

        const hrvData: Omit<TrackHrvEffPredict, 'timestamp'> = {
            track_id,
            hr: HR,
            rmssd: Math.log(RMSSD),
            lfhf: Math.log(LFHF),
        };

        const predictionsMetaData: Omit<TrackPredictionsMeta, 'smoothness'> & { smoothness: string } = {
            track_id,
            mode_mean: extractData.thumbnail_prediction_features.mode_mean,
            pulse_clarity_mean: extractData.thumbnail_prediction_features.pulse_clarity_mean,
            tempo_mean_bpm: extractData.thumbnail_prediction_features.tempo_mean_bpm,
            music_envelope_mean: extractData.thumbnail_prediction_features.music_envelope_mean,
            music_envelope_std: extractData.thumbnail_prediction_features.music_envelope_std,
            f0_envelope_mean_hz: extractData.thumbnail_prediction_features.f0_envelope_mean_hz,
            f0_midi_mean: extractData.thumbnail_prediction_features.f0_midi_mean,
            f0_midi_variance: extractData.thumbnail_prediction_features.f0_midi_variance,
            f0_midi_std: extractData.thumbnail_prediction_features.f0_midi_std,
            loudness_envelope_mean: extractData.thumbnail_prediction_features.loudness_envelope_mean,
            loudness_stability: extractData.thumbnail_prediction_features.loudness_stability,
            smoothness: JSON.stringify(extractData.smoothness),
        };

        const validationArraysData: TrackValidationArrays = {
            track_id,
            sampling_rate_hz: extractData.thumbnail_validation_arrays.sampling_rate_hz,
            array_length: extractData.thumbnail_validation_arrays.array_length,
            music_envelope_4hz: extractData.thumbnail_validation_arrays.music_envelope_4hz,
            f0_envelope_hz_4hz: extractData.thumbnail_validation_arrays.f0_envelope_4hz,  // ← 映射到数据库字段名
            loudness_envelope_4hz: extractData.thumbnail_validation_arrays.loudness_envelope_4hz,
        };

        // Step 5: 使用事務插入所有資料
        const dbRes = await try_catch(
            db.transaction().execute(async (trx) => {
                await trx.insertInto('track').values(trackData).execute();
                await trx.insertInto('track_platform').values(trackPlatformData).execute();
                await trx.insertInto('track_global_risks').values(globalRisksData).execute();
                await trx.insertInto('track_hrv_eff_predict').values(hrvData).execute();
                await trx.insertInto('track_predictions_meta').values(predictionsMetaData).execute();
                await trx.insertInto('track_validation_arrays').values(validationArraysData).execute();
                return track_id;
            })
        );

        if (dbRes.error) {
            return { data: null, error: dbRes.error };
        }

        return result(track_id);

    } catch (error) {
        return { data: null, error: error as Error };
    }
}

interface ImportTrackResult {
    filePath: string;
    track_id?: string;
    error?: Error;
    skipped?: boolean;
    skipReason?: string;
}

/**
 * 巢狀讀取目錄並匯入所有音訊檔案
 * 
 * @param dirPath - 目錄路徑
 * @param onResult - 每個結果的回調函式
 */
export async function import_tracks_from_directory(
    dirPath: string,
    onResult: (result: ImportTrackResult) => void
): Promise<void> {
    async function traverseDirectory(currentPath: string): Promise<void> {
        try {
            const entries = await readdir(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = join(currentPath, entry.name);

                if (entry.isDirectory()) {
                    // 遞迴處理子目錄
                    await traverseDirectory(fullPath);
                } else if (entry.isFile()) {
                    // 檢查檔案副檔名是否為音訊檔
                    const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();

                    if (AUDIO_EXTENSIONS.includes(ext)) {
                        console.log(`🎵 匯入: ${fullPath}`);

                        const importRes = await import_track(fullPath);

                        if (importRes.skipped) {
                            // 簡化跳過項目的日誌，使用 stderr 避免缓冲
                            const reasonMsg = importRes.skipReason === 'duration_exceeded' ? '(時長過長)' : '(已存在)';
                            process.stderr.write(`⏭️  ${entry.name} ${reasonMsg}\n`);
                            const jamendoId = Number(entry.name.replace(/\.[^.]+$/, ''));
                            existed.add(jamendoId);
                            onResult({
                                filePath: fullPath,
                                skipped: true,
                                skipReason: importRes.skipReason,
                            });
                        } else if (importRes.error) {
                            console.error(`❌ 失敗: ${entry.name}`, importRes.error.message);
                            onResult({
                                filePath: fullPath,
                                error: importRes.error,
                            });
                        } else {
                            console.log(`✅ 成功: ${entry.name} (track_id: ${importRes.data})`);
                            const jamendoId = Number(entry.name.replace(/\.[^.]+$/, ''));
                            existed.add(jamendoId);
                            onResult({
                                filePath: fullPath,
                                track_id: importRes.data,
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`讀取目錄失敗: ${currentPath}`, error);
            throw error;
        }
    }

    try {
        // 檢查路徑是否存在
        const dirStat = await stat(dirPath);
        if (!dirStat.isDirectory()) {
            throw new Error(`路徑不是目錄: ${dirPath}`);
        }

        await traverseDirectory(dirPath);
    } catch (error) {
        console.error(`巢狀讀取失敗:`, error);
        throw error;
    }
}


(async () => {
    const results: ImportTrackResult[] = [];
    let failedItemsFromPrevious: Record<string, { path: string; error: string }> = {}; // 前一次失敗的項目

    // Step 0: 從資料庫加載已存在的 jamendo id
    try {
        const existedRecords = await db
            .selectFrom('track_platform')
            .select('platform_id')
            .where('platform', '=', 'jamendo')
            .execute();

        console.log(`✅ 已加載 ${existedRecords.length} 個已存在的曲目`);

        for (const record of existedRecords) {
            const jamendoId = Number(record.platform_id);
            existed.add(jamendoId);
        }
    } catch (error) {
        console.error('⚠️  加載已存在曲目失敗:', error);
    }

    // Step 0.5: 從最新的失敗日誌中加載失敗項目
    try {
        const files = await readdir('.');
        const failureFiles = files.filter(f => f.startsWith('import_failures_') && f.endsWith('.json'));

        if (failureFiles.length > 0) {
            // 用文件修改時間找到最新的
            let latestFile = failureFiles[0];
            let latestTime = (await stat(latestFile)).mtime.getTime();

            for (const file of failureFiles.slice(1)) {
                const fileTime = (await stat(file)).mtime.getTime();
                if (fileTime > latestTime) {
                    latestTime = fileTime;
                    latestFile = file;
                }
            }

            const content = await readFile(latestFile, 'utf-8');
            failedItemsFromPrevious = JSON.parse(content);

            if (Object.keys(failedItemsFromPrevious).length > 0) {
                console.log(`📋 從最新失敗日誌加載: ${latestFile} (${Object.keys(failedItemsFromPrevious).length} 個項目)`);
                // 把前一次失敗的項目加入到 existed 集合中，以便跳過它們
                for (const filename in failedItemsFromPrevious) {
                    const jamendoId = Number(filename.replace(/\.[^.]+$/, ''));
                    if (!isNaN(jamendoId)) {
                        existed.add(jamendoId);
                    }
                }
            }
        }
    } catch (error) {
        // 忽略錯誤（可能沒有失敗日誌）
    }

    const outputFailures = async () => {
        console.log('exporting failure list...');
        // 合併前一次失敗的項目和本次新失敗的項目
        const failedList = { ...failedItemsFromPrevious };

        // 添加本次新失敗的項目（但移除已成功的項目）
        for (const result of results) {
            const filename = basename(result.filePath);

            if (result.error || result.skipReason === 'duration_exceeded') {
                // 本次失敗或因時長過長跳過，記錄它
                failedList[filename] = {
                    path: result.filePath,
                    error: result.error?.message || (result.skipReason === 'duration_exceeded' ? 'Duration exceeded 10 minutes' : 'Unknown error')
                };
            } else if (result.track_id) {
                // 本次成功，從失敗列表中移除
                delete failedList[filename];
            }
        }

        if (Object.keys(failedList).length > 0) {
            try {
                const now = new Date();
                const MM = String(now.getMonth() + 1).padStart(2, '0');
                const dd = String(now.getDate()).padStart(2, '0');
                const hh = String(now.getHours()).padStart(2, '0');
                const mm = String(now.getMinutes()).padStart(2, '0');
                const ss = String(now.getSeconds()).padStart(2, '0');
                const filename = `import_failures_${MM}_${dd}_${hh}_${mm}_${ss}.json`;

                const content = JSON.stringify(failedList, null, 2);
                await writeFile(filename, content);
                console.log(`📝 失敗列表已輸出至: ./${filename}`);
            } catch (writeErr) {
                console.error('⚠️  寫入失敗列表失敗:', writeErr);
            }
        } else {
            console.log('✅ 無失敗項目');
        }
    };

    // 處理中斷信號
    process.on('SIGINT', async () => {
        console.log('\n⛔ 匯入已中斷');
        const successful = results.filter(r => r.track_id).length;
        const failed = results.filter(r => r.error).length;
        const skipped = results.filter(r => r.skipped).length;
        console.log(`統計: ${successful} 成功, ${failed} 失敗, ${skipped} 跳過`);
        await outputFailures();
        process.exit(0);
    });

    try {
        await import_tracks_from_directory('/media/me2hard/EnderChest1/mtg_jamendo', (result) => {
            results.push(result);
        });

        const successful = results.filter(r => r.track_id).length;
        const failed = results.filter(r => r.error).length;
        const skipped = results.filter(r => r.skipped).length;
        console.log(`✅ 匯入完成: ${successful} 成功, ${failed} 失敗, ${skipped} 跳過`);
        await outputFailures();
    } catch (error) {
        console.error('❌ 批量匯入失敗:', error);
        await outputFailures();
    }
})();