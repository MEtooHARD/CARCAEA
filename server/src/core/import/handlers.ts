import { randomUUID } from 'crypto';
import { parseFile } from 'music-metadata';
import type {
    ExtractPulseClarityTimelineResponse,
    ExtractTempoPulseResponse,
    ExtractTimelinesResponse,
} from '../../types/audio-extractor-api';
import type { ChromaMatrix } from '../../types/metrix';
import { mode_score } from '../../util/audio_feat/mode';
import { statistic } from '../../util/audio_feat/statistic';
import { extractThumbnail } from '../../util/audio_feat/thumbnail';
import { snap_values_iterative, mode } from '../../util/math';
import { db, DATABASE } from '../Database';

const EXTRACTOR_BASE = `http://${process.env.EXTRACTOR ?? 'extractor'}:${process.env.EXTRACTOR_IN_PORT ?? '5000'}`;
const JAMENDO_CLIENT_ID = process.env.JAMENDO_CLIENT_ID ?? 'b7731e42';

const DURATION_MIN_S = 90;   // 1m 30s
const DURATION_MAX_S = 480;  // 8m 00s

// ─────────────────────────────────────────────────────────────────────────────
// Audio duration (music-metadata — pure Node.js, no system deps)
// ─────────────────────────────────────────────────────────────────────────────

async function get_audio_duration(file_path: string): Promise<number | null> {
    try {
        const meta = await parseFile(file_path, { duration: true });
        return meta.format.duration ?? null;
    } catch {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Extractor HTTP helpers (application/x-www-form-urlencoded)
// ─────────────────────────────────────────────────────────────────────────────

async function call_timelines(file_path: string): Promise<ExtractTimelinesResponse> {
    const body = new URLSearchParams({ file_path });
    const res = await fetch(`${EXTRACTOR_BASE}/extract/timelines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    if (!res.ok) throw new Error(`/extract/timelines ${res.status}: ${await res.text()}`);
    return res.json() as Promise<ExtractTimelinesResponse>;
}

async function call_tempo_pulse(
    file_path: string,
    start_sec?: number,
    end_sec?: number,
): Promise<ExtractTempoPulseResponse> {
    const body = new URLSearchParams({ file_path });
    if (start_sec != null) body.append('start_sec', String(start_sec));
    if (end_sec != null) body.append('end_sec', String(end_sec));
    const res = await fetch(`${EXTRACTOR_BASE}/extract/tempo_pulse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    if (!res.ok) throw new Error(`/extract/tempo_pulse ${res.status}: ${await res.text()}`);
    return res.json() as Promise<ExtractTempoPulseResponse>;
}

async function call_pulse_clarity_timeline(file_path: string): Promise<ExtractPulseClarityTimelineResponse> {
    // window=30s, hop=10s — gives sparse envelope (~1 value per 10s)
    const body = new URLSearchParams({ file_path, window_size: '30', hop_length: '10' });
    const res = await fetch(`${EXTRACTOR_BASE}/extract/pulse_clarity_timeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    if (!res.ok) throw new Error(`/extract/pulse_clarity_timeline ${res.status}: ${await res.text()}`);
    return res.json() as Promise<ExtractPulseClarityTimelineResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Jamendo metadata
// ─────────────────────────────────────────────────────────────────────────────

interface JamendoMeta {
    name: string;
    artist_name: string | null;
    genres: string[];
    instruments: string[];
    vartags: string[];
    vocalinstrumental: boolean | null;
    acousticelectric: boolean | null;
    /** Non-empty string when the track is streamable on Jamendo */
    audio_url: string | null;
    duration_sec: number | null;
}

async function fetch_jamendo_meta(jamendo_id: number): Promise<JamendoMeta | null> {
    if (!JAMENDO_CLIENT_ID) return null;
    try {
        const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${JAMENDO_CLIENT_ID}&id=${jamendo_id}&include=musicinfo`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const json = await res.json() as any;
        const track = json?.results?.[0];
        if (!track) return null;

        const vi = track.vocalinstrumental;
        const ae = track.acousticelectric;

        return {
            name: track.name ?? String(jamendo_id),
            artist_name: track.artist_name ?? null,
            genres: track.musicinfo?.tags?.genres ?? [],
            instruments: track.musicinfo?.tags?.instruments ?? [],
            vartags: track.musicinfo?.tags?.vartags ?? [],
            vocalinstrumental: vi === 'instrumental' ? false : vi === 'vocal' ? true : null,
            acousticelectric: ae === 'acoustic' ? true : ae === 'electric' ? false : null,
            audio_url: track.audio && String(track.audio).length > 0 ? String(track.audio) : null,
            duration_sec: track.duration != null ? Number(track.duration) : null,
        };
    } catch {
        return null;
    }
}

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

/**
 * Returns elements of a pulse_clarity_timeline (hop=10s, window=30s)
 * whose window center falls within [thumbnail_start, thumbnail_end].
 * Falls back to full array if no windows match.
 */
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
// Idempotency check
// ─────────────────────────────────────────────────────────────────────────────

export async function is_already_imported(jamendo_id: number): Promise<boolean> {
    const row = await db
        .selectFrom('track_platform')
        .innerJoin('track', 'track.id', 'track_platform.track_id')
        .where('track_platform.platform', '=', 'jamendo')
        .where('track_platform.platform_id', '=', String(jamendo_id))
        .select('track_platform.track_id')
        .executeTakeFirst();
    return row != null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main import handler
// ─────────────────────────────────────────────────────────────────────────────

export type ImportOutcome =
    | { status: 'imported'; track_id: string }
    | { status: 'hidden'; track_id: string; reason: string }
    | { status: 'skipped' }
    | { status: 'failed'; reason: string };

/**
 * Import a single Jamendo track into the database.
 *
 * Tracks that are not streamable on Jamendo, or have out-of-range duration,
 * are inserted as hidden (hidden=true, hidden_reason set) and no audio
 * features are extracted for them.
 *
 * @param jamendo_id   Numeric Jamendo track ID (filename stem)
 * @param file_path    Path to the MP3 file *as seen by the extractor container*
 *                     (typically /app/audio_storage/{jamendo_id}.mp3)
 */
export async function import_track(
    jamendo_id: number,
    file_path: string,
): Promise<ImportOutcome> {
    // ── 1. Idempotency ────────────────────────────────────────────────────────
    if (await is_already_imported(jamendo_id)) return { status: 'skipped' };

    // ── 2. Jamendo metadata (needed for streamability + duration) ─────────────
    const meta = await fetch_jamendo_meta(jamendo_id);
    const track_name = meta?.name ?? String(jamendo_id);

    // ── 3. Streamability check ────────────────────────────────────────────────
    if (meta && !meta.audio_url) {
        const track_id = randomUUID();
        await db.insertInto('track')
            .values({ id: track_id, name: track_name, duration_s: meta.duration_sec ?? 0, hidden: true, hidden_reason: 'not_streamable' })
            .onConflict(oc => oc.doNothing())
            .execute();
        await DATABASE.Tracks.insert_platform(track_id, 'jamendo', String(jamendo_id));
        if (meta) await _upsert_meta(track_id, meta);
        return { status: 'hidden', track_id, reason: 'not_streamable' };
    }

    // ── 4. Duration check (from musicmetadata, pre-filter before extractor) ───
    const audio_duration = await get_audio_duration(file_path);
    if (audio_duration == null) {
        return { status: 'failed', reason: 'cannot read audio duration' };
    }
    if (audio_duration < DURATION_MIN_S || audio_duration > DURATION_MAX_S) {
        const reason = audio_duration < DURATION_MIN_S ? 'too_short' : 'too_long';
        const track_id = randomUUID();
        await db.insertInto('track')
            .values({ id: track_id, name: track_name, duration_s: audio_duration, hidden: true, hidden_reason: reason })
            .onConflict(oc => oc.doNothing())
            .execute();
        await DATABASE.Tracks.insert_platform(track_id, 'jamendo', String(jamendo_id));
        if (meta) await _upsert_meta(track_id, meta);
        return { status: 'hidden', track_id, reason };
    }

    // ── 5. Timelines (loudness + chroma @ 4 Hz) ───────────────────────────────
    const tl = await call_timelines(file_path);
    const { loudness, chroma_matrix: raw_chroma, chroma_flux } = tl.timelines;
    const sample_rate = tl.metadata.target_hz;   // 4
    const duration_sec = tl.metadata.duration_sec;
    const chroma_matrix = raw_chroma as ChromaMatrix[];

    // ── 6. Pulse clarity + tempo timeline (sparse, one value per 10 s) ────────
    const pct = await call_pulse_clarity_timeline(file_path);
    const env_tempo = pct.tempo_timeline;
    const env_pulse_clarity = pct.pulse_clarity_timeline;

    // ── 7. Thumbnail (SSM-based 30 s segment) ─────────────────────────────────
    const thumbnail = extractThumbnail(chroma_matrix, loudness);

    // ── 8. Precise tempo + pulse clarity for thumbnail section ────────────────
    const tn_tp = await call_tempo_pulse(file_path, thumbnail.start_sec, thumbnail.end_sec);

    // ── 9. Global statistics ──────────────────────────────────────────────────
    const loud_stats = statistic(loudness);
    const flux_stats = statistic(chroma_flux);
    const global_mode = mode_score(chroma_matrix);
    const global_pulse_clarity = arr_mean(env_pulse_clarity);

    // Weighted tempo: snap first, then group by tempo value, sum pc for each group, take highest
    const snapped_tempo = snap_values_iterative(env_tempo, 1.0, 2, 3);
    const tempo_pc_map = new Map<number, number>();
    for (let i = 0; i < snapped_tempo.length; i++) {
        const t = Math.round(snapped_tempo[i] * 10) / 10; // round to 1 decimal
        const pc = env_pulse_clarity[i];
        tempo_pc_map.set(t, (tempo_pc_map.get(t) ?? 0) + pc);
    }
    const global_tempo = Array.from(tempo_pc_map.entries())
        .sort(([, a], [, b]) => b - a)[0]?.[0] ?? arr_mean(env_tempo);
    const global_tempo_std = arr_std(env_tempo);

    // ── 10. Thumbnail envelope slices (4 Hz) ──────────────────────────────────
    const tn_start_frame = Math.floor(thumbnail.start_sec * sample_rate);
    const tn_end_frame = Math.ceil(thumbnail.end_sec * sample_rate);
    const tn_loudness = loudness.slice(tn_start_frame, tn_end_frame);
    const tn_chroma_flux = chroma_flux.slice(tn_start_frame, tn_end_frame);
    const tn_chroma = chroma_matrix.slice(tn_start_frame, tn_end_frame);

    const tn_loud_stats = statistic(tn_loudness.length > 0 ? tn_loudness : loudness);
    const tn_flux_stats = statistic(tn_chroma_flux.length > 0 ? tn_chroma_flux : chroma_flux);
    const tn_mode = mode_score(tn_chroma.length > 0 ? tn_chroma : chroma_matrix);

    const tn_tempo_slice = slice_pulse_timeline(snapped_tempo, thumbnail.start_sec, thumbnail.end_sec);
    const tn_tempo_std = arr_std(tn_tempo_slice); // std of snapped values in thumbnail range

    // ── 10. DB inserts ─────────────────────────────────────────────────────────
    const track_id = randomUUID();

    await DATABASE.Tracks.insert(track_id, track_name, duration_sec);
    await DATABASE.Tracks.insert_platform(track_id, 'jamendo', String(jamendo_id));
    if (meta) await _upsert_meta(track_id, meta);

    await DATABASE.Tracks.upsert_features(track_id, {
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
        thumbnail_pulse_clarity: tn_tp.pulse_clarity,
        thumbnail_loud_mean: tn_loud_stats.mean,
        thumbnail_loud_std: tn_loud_stats.std,
        thumbnail_loud_skewness: tn_loud_stats.skewness,
        thumbnail_chroma_flux_mean: tn_flux_stats.mean,
        thumbnail_chroma_flux_std: tn_flux_stats.std,
        thumbnail_chroma_flux_skewness: tn_flux_stats.skewness,
    });

    await DATABASE.Tracks.upsert_envelopes(track_id, {
        loud_chroma_sample_rate: Math.round(sample_rate),
        env_loudness_db: loudness,
        env_chroma_matrix: raw_chroma as any,
        env_chroma_flux: chroma_flux,
        env_tempo,
        env_pulse_clarity,
    });

    return { status: 'imported', track_id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper
// ─────────────────────────────────────────────────────────────────────────────

async function _upsert_meta(track_id: string, meta: JamendoMeta) {
    await DATABASE.Tracks.upsert_metadata(track_id, {
        artist_name: meta.artist_name,
        genres: meta.genres,
        instruments: meta.instruments,
        vartags: meta.vartags,
        vocalinstrumental: meta.vocalinstrumental,
        acousticelectric: meta.acousticelectric,
        tags_source: 'jamendo',
    });
}
