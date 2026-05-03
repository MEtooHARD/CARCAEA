import { appendFile, writeFile } from 'fs/promises';
import { basename } from 'path';
import { db } from '../../core/Database';
import { get_files } from '../../util/read';
import { import_track } from './handlers';

// Path where audio files are mounted in the container
const AUDIO_PATH = '/app/audio_storage';
const LOG_FILE = `./import_failures_${new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()}.jsonl`;

/** Load all already-imported Jamendo IDs into a Set for O(1) lookup. */
async function load_imported_ids(): Promise<Set<number>> {
    const rows = await db
        .selectFrom('track_platform')
        .innerJoin('track', 'track.id', 'track_platform.track_id')
        .where('track_platform.platform', '=', 'jamendo')
        .select('track_platform.platform_id')
        .execute();
    return new Set(rows.map(r => Number(r.platform_id)));
}

async function main() {
    console.log(`Scanning: ${AUDIO_PATH}`);
    const files = await get_files(AUDIO_PATH,
        (dirent) => dirent.isDirectory() || (dirent.isFile() && dirent.name.endsWith('.mp3')));
    console.log(`Found ${files.length} MP3 files`);

    console.log('Loading already-imported IDs...');
    const imported_ids = await load_imported_ids();
    console.log(`  Already in DB: ${imported_ids.size} (expected ~${Math.round(imported_ids.size / 100) * 100})\n`);
    if (imported_ids.size === 0) {
        console.warn('WARNING: Set is empty — DB query may have failed. Proceeding without pre-filter.');
    }

    await writeFile(LOG_FILE, '');

    let imported = 0, hidden = 0, skipped = 0, failed = 0;

    for (let i = 0; i < files.length; i++) {
        const file_path = files[i];
        const stem = basename(file_path, '.mp3');
        const jamendo_id = Number(stem);

        if (isNaN(jamendo_id)) {
            console.log(`[${i + 1}/${files.length}] SKIP (non-numeric): ${stem}`);
            skipped++;
            continue;
        }

        // Fast in-memory idempotency check — avoids N DB queries on restart
        if (imported_ids.has(jamendo_id)) {
            skipped++;
            continue;
        }

        process.stdout.write(`[${i + 1}/${files.length}] ${stem}.mp3 ... `);

        try {
            const outcome = await import_track(jamendo_id, file_path);
            if (outcome.status === 'imported') {
                console.log(`✓ ${outcome.track_id}`);
                imported++;
            } else if (outcome.status === 'hidden') {
                console.log(`H hidden (${outcome.reason})`);
                hidden++;
            } else if (outcome.status === 'failed') {
                console.error(`✗ failed: ${outcome.reason}`);
                failed++;
                await appendFile(LOG_FILE, JSON.stringify({ jamendo_id, reason: outcome.reason }) + '\n');
            } else {
                console.log(`– skipped`);
                skipped++;
            }
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            console.error(`✗ ${reason}`);
            failed++;
            await appendFile(LOG_FILE, JSON.stringify({ jamendo_id, reason }) + '\n');
        }
    }

    console.log(`\n── Import complete ──`);
    console.log(`  Imported : ${imported}`);
    console.log(`  Hidden   : ${hidden}`);
    console.log(`  Skipped  : ${skipped}`);
    console.log(`  Failed   : ${failed}`);
    if (failed > 0) console.log(`  Log      : ${LOG_FILE}`);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
