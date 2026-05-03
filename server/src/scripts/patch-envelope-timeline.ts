/**
 * Patch script: re-extract env_tempo / env_pulse_clarity for tracks that were
 * originally processed with the old window=30s / hop=10s parameters, and
 * update the derived global + thumbnail features.
 *
 * Identification heuristic: if array_length(env_tempo) ≈ ceil((duration-30)/10)+1
 * (within ±2 frames), the track was processed with the old params.
 *
 * New params: window=12s, hop=4s
 *
 * Usage:
 *   npm run patch:envelope              # Patch all old-param tracks
 *   npm run patch:envelope -- --dry-run # Print count only, no updates
 *   npm run patch:envelope -- --limit N # Process at most N tracks
 */

import process from 'process';
import { sql } from 'kysely';
import { db, DATABASE } from '../core/Database.js';
import { snap_values_iterative, mode } from '../util/math.js';

const EXTRACTOR_BASE = `http://${process.env.EXTRACTOR ?? 'extractor'}:${process.env.EXTRACTOR_IN_PORT ?? '5000'}`;

const WIN = 12;  // new window size (seconds)
const HOP = 4;  // new hop length (seconds)

// ─────────────────────────────────────────────────────────────────────────────
// Math helpers
// ─────────────────────────────────────────────────────────────────────────────

function arr_mean(arr: number[]): number {
    return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function arr_std(arr: number[]): number {
    if (arr.length < 2) return 0;
    const mean = arr_mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
}

/** Slice timeline to frames whose window center falls within [start, end]. */
function slice_pulse_timeline(
    arr: number[],
    start: number,
    end: number,
    hop = HOP,
    win = WIN,
): number[] {
    const result = arr.filter((_, i) => {
        const center = i * hop + win / 2;
        return center >= start && center <= end;
    });
    return result.length > 0 ? result : arr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extractor call
// ─────────────────────────────────────────────────────────────────────────────

async function call_pulse_clarity_timeline(file_path: string): Promise<{
    pulse_clarity_timeline: number[];
    tempo_timeline: number[];
}> {
    const body = new URLSearchParams({
        file_path,
        window_size: String(WIN),
        hop_length: String(HOP),
    });
    const res = await fetch(`${EXTRACTOR_BASE}/extract/pulse_clarity_timeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    if (!res.ok) throw new Error(`/extract/pulse_clarity_timeline ${res.status}: ${await res.text()}`);
    return res.json() as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dry_run = args.includes('--dry-run');
const limit_idx = args.indexOf('--limit');
const limit = limit_idx !== -1 ? parseInt(args[limit_idx + 1] ?? '0', 10) : Infinity;

console.log(`🔧 Patch envelope timeline  (window=${WIN}s, hop=${HOP}s)`);
if (dry_run) console.log('   [DRY RUN — no writes]');

// Find tracks whose env_tempo length matches the old w=30/hop=10 formula.
// expected_old = ceil((duration_sec - 30) / 10) + 1
// Tolerance ±2 frames to cover rounding differences.
const rows = await db
    .selectFrom('track_feat_envelopes as fe')
    .innerJoin('track as t', 't.id', 'fe.track_id')
    .innerJoin('track_platform as tp', 'tp.track_id', 'fe.track_id')
    .innerJoin('track_audio_features as af', 'af.track_id', 'fe.track_id')
    .where('tp.platform', '=', 'jamendo')
    .where(sql<boolean>`ABS(
        array_length(fe.env_tempo, 1)
        - (CEIL((t.duration_s - 30.0) / 10.0)::int + 1)
    ) <= 2`)
    .select([
        'fe.track_id',
        'tp.platform_id as jamendo_id',
        't.duration_s',
        'af.thumbnail_start_sec',
        'af.thumbnail_end_sec',
    ])
    .execute();

console.log(`Found ${rows.length} track(s) with old envelope params`);

if (rows.length === 0 || dry_run) {
    process.exit(0);
}

const total = Math.min(rows.length, limit);
let success = 0;
let failed = 0;

for (let i = 0; i < total; i++) {
    const row = rows[i];
    const jamendo_id = row.jamendo_id;
    const subdir = jamendo_id.slice(-2);
    const file_path = `/app/audio_storage/${subdir}/${jamendo_id}.mp3`;

    const pct = Math.round(((i + 1) / total) * 100);
    process.stdout.write(`[${String(i + 1).padStart(String(total).length)}/${total}] ${pct}% ${row.track_id}  `);

    try {
        const pct_data = await call_pulse_clarity_timeline(file_path);
        const env_tempo = pct_data.tempo_timeline;
        const env_pulse_clarity = pct_data.pulse_clarity_timeline;

        // Global tempo (pulse-clarity-weighted)
        const snapped = snap_values_iterative(env_tempo, 1.0, 2, 3);
        const pc_map = new Map<number, number>();
        for (let j = 0; j < snapped.length; j++) {
            const t = Math.round(snapped[j] * 10) / 10;
            pc_map.set(t, (pc_map.get(t) ?? 0) + env_pulse_clarity[j]);
        }
        const global_tempo = Array.from(pc_map.entries()).sort(([, a], [, b]) => b - a)[0]?.[0] ?? arr_mean(env_tempo);
        const global_tempo_std = arr_std(env_tempo);
        const global_pulse_clarity = arr_mean(env_pulse_clarity);

        // Thumbnail slice
        const tn_start = row.thumbnail_start_sec ?? 0;
        const tn_end = row.thumbnail_end_sec ?? (row.duration_s ?? 0);
        const tn_tempo_slice = slice_pulse_timeline(snapped, tn_start, tn_end);
        const thumbnail_tempo = mode(tn_tempo_slice);
        const thumbnail_tempo_std = arr_std(tn_tempo_slice);
        const thumbnail_pulse_clarity = arr_mean(
            slice_pulse_timeline(env_pulse_clarity, tn_start, tn_end)
        );

        // Update track_audio_features (only tempo/pulse_clarity columns)
        await db.updateTable('track_audio_features')
            .set({
                tempo: global_tempo,
                tempo_std: global_tempo_std,
                pulse_clarity: global_pulse_clarity,
                thumbnail_tempo: thumbnail_tempo,
                thumbnail_tempo_std: thumbnail_tempo_std,
                thumbnail_pulse_clarity: thumbnail_pulse_clarity,
            })
            .where('track_id', '=', row.track_id)
            .execute();

        // Update track_feat_envelopes (only env_tempo / env_pulse_clarity)
        await db.updateTable('track_feat_envelopes')
            .set({
                env_tempo: sql`${JSON.stringify(env_tempo)}::jsonb`,
                env_pulse_clarity: sql`${JSON.stringify(env_pulse_clarity)}::jsonb`,
            })
            .where('track_id', '=', row.track_id)
            .execute();

        process.stdout.write('✓\n');
        success++;
    } catch (err) {
        process.stdout.write(`✗ ${err instanceof Error ? err.message : String(err)}\n`);
        failed++;
    }
}

console.log(`\nDone: ${success} patched, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
