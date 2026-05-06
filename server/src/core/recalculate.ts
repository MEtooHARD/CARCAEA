/**
 * Universal recalculation framework for audio features.
 * Fetches envelopes, recomputes features, and updates the database.
 */

import { DATABASE } from './Database';
import { mode_score } from '../util/audio_feat/mode';
import { statistic } from '../util/audio_feat/statistic';
import { extractThumbnail } from '../util/audio_feat/thumbnail';
import { snap_values_iterative, mode, L2 } from '../util/math';
import type { ChromaMatrix } from '../types/metrix';

// ─────────────────────────────────────────────────────────────────────────────
// Stat helpers
// ─────────────────────────────────────────────────────────────────────────────

function arr_mean(arr: number[]): number {
    return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function arr_std(arr: number[]): number {
    if (arr.length < 2) return 0;
    const mean = arr_mean(arr);
    return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
}

function slice_pulse_timeline(
    arr: number[],
    thumbnail_start: number,
    thumbnail_end: number,
    hop = 10,
    win = 30,
): number[] {
    const result = arr.filter((_, i) => {
        const center = i * hop + win / 2;
        return center >= thumbnail_start && center <= thumbnail_end;
    });
    return result.length > 0 ? result : arr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main recalculation logic
// ─────────────────────────────────────────────────────────────────────────────

export interface RecalculateOptions {
    /** If provided, only recalculate this track_id; otherwise recalculate all */
    track_id?: string;
    /** Callback for progress logging */
    onProgress?: (current: number, total: number, track_id: string) => void;
}

/**
 * Recalculate audio features for specified tracks.
 * Uses existing envelope data (env_loudness, env_chroma, env_tempo, env_pulse_clarity).
 */
export async function recalculate_features(options: RecalculateOptions = {}): Promise<void> {
    const { track_id: filter_id, onProgress } = options;

    // Fetch all tracks (or one specific track)
    let tracks: any[] = [];
    if (filter_id) {
        const res = await DATABASE.Tracks.find_by_id(filter_id);
        tracks = res.data ? [res.data] : [];
    } else {
        // Fetch all tracks in pages to avoid memory / query limit issues
        const PAGE = 1000;
        let offset = 0;
        while (true) {
            const res = await DATABASE.Tracks.list_with_features(PAGE, offset);
            const page = res.data ?? [];
            tracks.push(...page);
            if (page.length < PAGE) break;
            offset += PAGE;
        }
    }

    if (tracks.length === 0) {
        console.warn('No tracks found to recalculate');
        return;
    }

    console.log(`Recalculating ${tracks.length} track(s)...`);

    for (let idx = 0; idx < tracks.length; idx++) {
        const track = tracks[idx];
        try {
            onProgress?.(idx + 1, tracks.length, track.id);

            // Fetch envelope data
            const env_res = await DATABASE.Tracks.get_envelopes(track.id);
            if (env_res.error || !env_res.data) {
                console.warn(`[${track.id}] No envelope data found, skipping`);
                continue;
            }

            const env = env_res.data;
            const sample_rate = env.loud_chroma_sample_rate;
            const loudness = env.env_loudness_db;
            const chroma_matrix = env.env_chroma_matrix as ChromaMatrix[];
            const chroma_flux = env.env_chroma_flux;
            const env_tempo = env.env_tempo;
            const env_pulse_clarity = env.env_pulse_clarity;

            // ── Recalculate global statistics ────────────────────────────────
            const loud_stats = statistic(loudness);
            const flux_stats = statistic(chroma_flux);
            const global_mode = mode_score(chroma_matrix);
            const global_pulse_clarity = arr_mean(env_pulse_clarity);

            // Weighted tempo (snap → group by value → sum pulse_clarity → max)
            const snapped_tempo = snap_values_iterative(env_tempo, 1.0, 2, 3);
            const tempo_pc_map = new Map<number, number>();
            for (let i = 0; i < snapped_tempo.length; i++) {
                const t = Math.round(snapped_tempo[i] * 10) / 10;
                const pc = env_pulse_clarity[i];
                tempo_pc_map.set(t, (tempo_pc_map.get(t) ?? 0) + pc);
            }
            const global_tempo = Array.from(tempo_pc_map.entries())
                .sort(([, a], [, b]) => b - a)[0]?.[0] ?? arr_mean(env_tempo);
            const global_tempo_std = arr_std(env_tempo);

            // ── Thumbnail calculation ────────────────────────────────────────
            const thumbnail = extractThumbnail(chroma_matrix, loudness);
            const tn_start_frame = Math.floor(thumbnail.start_sec * sample_rate);
            const tn_end_frame = Math.ceil(thumbnail.end_sec * sample_rate);
            const tn_loudness = loudness.slice(tn_start_frame, tn_end_frame);
            const tn_chroma_flux = chroma_flux.slice(tn_start_frame, tn_end_frame);
            const tn_chroma = chroma_matrix.slice(tn_start_frame, tn_end_frame);

            const tn_loud_stats = statistic(tn_loudness.length > 0 ? tn_loudness : loudness);
            const tn_flux_stats = statistic(tn_chroma_flux.length > 0 ? tn_chroma_flux : chroma_flux);
            const tn_mode = mode_score(tn_chroma.length > 0 ? tn_chroma : chroma_matrix);

            const tn_tempo_slice = slice_pulse_timeline(snapped_tempo, thumbnail.start_sec, thumbnail.end_sec);
            const tn_tempo_std = arr_std(tn_tempo_slice);

            // ── Update database ─────────────────────────────────────────────
            await DATABASE.Tracks.upsert_features(track.id, {
                tempo: global_tempo,
                tempo_std: global_tempo_std,
                mode: global_mode,
                pulse_clarity: global_pulse_clarity,
                loud_mean: loud_stats.mean,
                loud_std: loud_stats.std,
                loud_skewness: loud_stats.skewness,
                chroma_flux_mean: flux_stats.mean,
                chroma_flux_std: flux_stats.std,
                chroma_flux_skewness: flux_stats.skewness,
                thumbnail_start_sec: thumbnail.start_sec,
                thumbnail_end_sec: thumbnail.end_sec,
                thumbnail_score: thumbnail.score,
                thumbnail_coverage: thumbnail.coverage,
                thumbnail_tempo: mode(tn_tempo_slice),
                thumbnail_tempo_std: tn_tempo_std,
                thumbnail_mode: tn_mode,
                thumbnail_pulse_clarity: arr_mean(
                    slice_pulse_timeline(env_pulse_clarity, thumbnail.start_sec, thumbnail.end_sec)
                ),
                thumbnail_loud_mean: tn_loud_stats.mean,
                thumbnail_loud_std: tn_loud_stats.std,
                thumbnail_loud_skewness: tn_loud_stats.skewness,
                thumbnail_chroma_flux_mean: tn_flux_stats.mean,
                thumbnail_chroma_flux_std: tn_flux_stats.std,
                thumbnail_chroma_flux_skewness: tn_flux_stats.skewness,
            });

            console.log(`✓ Recalculated ${track.id}`);
        } catch (err) {
            console.error(`✗ Error recalculating ${track.id}:`, err);
        }
    }

    console.log('Recalculation complete');
}
