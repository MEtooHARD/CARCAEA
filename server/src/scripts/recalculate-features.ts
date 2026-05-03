/**
 * Script to recalculate audio features for all tracks (or a specific track).
 * Usage:
 *   npm run recalculate              # Recalculate all tracks
 *   npm run recalculate -- --id <id> # Recalculate specific track
 */

import process from 'process';
import { recalculate_features } from '../core/recalculate';

const args = process.argv.slice(2);
const track_id = args.includes('--id') ? args[args.indexOf('--id') + 1] : undefined;

console.log('🔄 Starting recalculation...\n');

try {
    const options: Parameters<typeof recalculate_features>[0] = {
        onProgress: (current, total, id) => {
            const pct = Math.round((current / total) * 100);
            console.log(`[${'='.repeat(Math.floor(pct / 5))}${'·'.repeat(20 - Math.floor(pct / 5))}] ${pct}% (${current}/${total}) - ${id}`);
        },
    };

    if (track_id) {
        options.track_id = track_id;
    }

    await recalculate_features(options);
    console.log('\n✅ Recalculation finished successfully');
    process.exit(0);
} catch (err) {
    console.error('\n❌ Recalculation failed:', err);
    process.exit(1);
}
