/**
 * 範例：掃描音訊資料夾並提取 timelines
 */

import scanAndProcess from './scan';
import { extractAndStoreTimelines } from './handlers';

// 設定掃描資料夾路徑
const AUDIO_FOLDER = '/path/to/your/audio/files';

async function main() {
    try {
        // 掃描資料夾並執行 handlers
        const result = await scanAndProcess(
            AUDIO_FOLDER,
            [
                extractAndStoreTimelines  // 依序執行的操作
                // 可添加更多 handler，例如：
                // extractThumbnails,
                // computeGlobalFeatures,
                // 等等
            ]
        );

        console.log('\n✅ Scan completed!');
        process.exit(result.errors.length > 0 ? 1 : 0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

main();
