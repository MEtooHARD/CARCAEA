/**
 * Audio Folder Scanner & Processor
 * 
 * 架構：
 * 1. 遞迴掃描資料夾尋找 .mp3 檔案
 * 2. 驗證檔名格式 (<jamendo_id>.mp3)
 * 3. 檢查 track_platform 表，去重複
 * 4. 若新檔案則在 track 和 track_platform 同時建檔
 * 5. 逐個執行傳入的 handler 陣列
 */

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { fileURLToPath } from 'url';
import type { DB } from '../types/database_schema';
import { Kysely, PostgresDialect } from 'kysely';

export const db = new Kysely<DB>({
    dialect: new PostgresDialect({
        pool: new Pool({
            host: 'localhost',
            database: 'carcaea',
            user: 'admin',
            port: 5433,
            password: '1234'
        })
    })
})

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 類型定義
// ============================================================================

/** 操作函數簽名：接收音訊檔案路徑和 track_id，執行某種操作 */
export type AudioHandler = (filePath: string, trackId: string) => Promise<void>;

/** 掃描結果 */
export interface ScanResult {
    totalFiles: number;
    processed: number;
    skipped: number;
    errors: Array<{ file: string; error: string }>;
}

// ============================================================================
// 核心掃描邏輯
// ============================================================================

/** 遞迴取得資料夾中所有 .mp3 檔案 */
async function getAllMp3Files(folderPath: string): Promise<string[]> {
    const files: string[] = [];

    async function traverse(dir: string) {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await traverse(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.mp3')) {
                files.push(fullPath);
            }
        }
    }

    await traverse(folderPath);
    return files;
}

/** 驗證檔名格式：必須是 <integer>.mp3 */
function validateFilename(filename: string): number | null {
    const baseName = path.basename(filename, '.mp3');
    const jamendoId = parseInt(baseName, 10);

    if (isNaN(jamendoId) || jamendoId <= 0 || baseName !== jamendoId.toString()) {
        return null;
    }
    return jamendoId;
}

/** 檢查該 jamendo id 是否已在 track_platform 表中 */
async function getExistingTrackId(jamendoId: number): Promise<string | null> {
    const result = await db
        .selectFrom('track_platform')
        .select('track_id')
        .where('platform', '==', 'jamendo')
        .where('platform_id', '==', jamendoId.toString())
        .executeTakeFirst();

    return result?.track_id ?? null;
}

/** 為新檔案創建 track 和 track_platform 記錄 */
async function createTrackAndPlatform(
    jamendoId: number,
    trackName: string
): Promise<string> {
    // 生成新 track_id (格式: jamendo_<id>_<timestamp>)
    const trackId = `jamendo_${jamendoId}_${Date.now()}`;

    // 插入 track 表
    await db
        .insertInto('track')
        .values({
            id: trackId,
            name: trackName,
            duration_s: 0  // 初始值，可由 handler 更新
        })
        .execute();

    // 插入 track_platform 表
    await db
        .insertInto('track_platform')
        .values({
            track_id: trackId,
            platform: 'jamendo',
            platform_id: jamendoId.toString()
        })
        .execute();

    console.log(`   ✅ Created track: ${trackId} (jamendo:${jamendoId})`);
    return trackId;
}

// ============================================================================
// 主掃描函數
// ============================================================================

/**
 * 掃描資料夾並執行 handler 陣列
 * 
 * @param folderPath 音訊檔案所在資料夾
 * @param handlers 要執行的操作陣列 (接收 filePath 和 trackId)
 * @returns 掃描結果摘要
 */
export async function scanAndProcess(
    folderPath: string,
    handlers: AudioHandler[]
): Promise<ScanResult> {
    console.log(`\n🎵 Audio Folder Scanner`);
    console.log(`📁 Folder: ${folderPath}`);
    console.log(`🔧 Handlers: ${handlers.length}`);

    const result: ScanResult = {
        totalFiles: 0,
        processed: 0,
        skipped: 0,
        errors: []
    };

    // 檢查資料夾是否存在
    if (!fs.existsSync(folderPath)) {
        throw new Error(`Folder not found: ${folderPath}`);
    }

    // 取得所有 .mp3 檔案
    console.log(`⏳ Scanning folder...`);
    const mp3Files = await getAllMp3Files(folderPath);
    result.totalFiles = mp3Files.length;

    if (mp3Files.length === 0) {
        console.log(`⚠️  No .mp3 files found`);
        return result;
    }

    console.log(`✅ Found ${mp3Files.length} files\n`);

    // 逐個檔案處理
    for (const filePath of mp3Files) {
        try {
            const filename = path.basename(filePath);

            // 驗證檔名格式
            const jamendoId = validateFilename(filename);
            if (!jamendoId) {
                console.log(`⚠️  [SKIPPED] Invalid filename format: ${filename}`);
                result.skipped++;
                continue;
            }

            // 檢查是否已存在
            let trackId = await getExistingTrackId(jamendoId);

            if (trackId) {
                console.log(`📌 [EXISTING] jamendo:${jamendoId} → trackId: ${trackId}`);
            } else {
                // 新檔案：建立 track 和 platform 記錄
                trackId = await createTrackAndPlatform(jamendoId, filename);
            }

            // 執行 handlers
            for (const handler of handlers) {
                await handler(filePath, trackId);
            }

            result.processed++;
            console.log(`✅ [PROCESSED] ${filename}\n`);

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            result.errors.push({
                file: path.basename(filePath),
                error: errorMsg
            });
            console.error(`❌ [ERROR] ${path.basename(filePath)}: ${errorMsg}\n`);
        }
    }

    // 結果摘要
    console.log(`\n📊 Summary`);
    console.log(`   Total: ${result.totalFiles}`);
    console.log(`   Processed: ${result.processed}`);
    console.log(`   Skipped: ${result.skipped}`);
    console.log(`   Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
        console.log(`\n⚠️  Errors:`);
        result.errors.forEach(err => {
            console.log(`   - ${err.file}: ${err.error}`);
        });
    }

    return result;
}

export default scanAndProcess;
