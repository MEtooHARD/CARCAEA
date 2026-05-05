/**
 * ML training orchestration — queries DB, builds training payload, calls ml_server,
 * saves resulting models and training data record back to DB.
 */

import { DATABASE } from './Database';
import { ML_BASE } from '../config';
import type { Result } from '../types/Result';

const DAYTIME_ENCODING: Record<string, number> = {
    morning: 0,
    afternoon: 1,
    evening: 2,
    night: 3,
};

/**
 * Trigger a full re-train for the given user.
 * Returns the new model_id on success, or an error.
 */
export async function trigger_train(user_id: string): Promise<Result<number>> {
    // 1. Fetch all training cases from DB
    const cases_res = await DATABASE.Models.get_training_cases(user_id);
    if (cases_res.error) return { data: null, error: cases_res.error };
    const rows = cases_res.data!;

    if (rows.length === 0) {
        return { data: null, error: new Error('No training cases available for this user') };
    }

    // 2. Build training payload
    const cases = rows.map(row => ({
        feedback_id: row.feedback_id,
        features: [
            row.tempo, row.tempo_std, row.mode, row.pulse_clarity,
            row.loud_mean, row.loud_std, row.loud_skewness,
            row.chroma_flux_mean, row.chroma_flux_std, row.chroma_flux_skewness,
            row.thumbnail_tempo, row.thumbnail_tempo_std, row.thumbnail_mode, row.thumbnail_pulse_clarity,
            row.thumbnail_loud_mean, row.thumbnail_loud_std, row.thumbnail_loud_skewness,
            row.thumbnail_chroma_flux_mean, row.thumbnail_chroma_flux_std, row.thumbnail_chroma_flux_skewness,
            row.u_hr_literal, row.u_rmssd_literal, row.u_sdnn_literal,
            row.u_pnn50_literal, row.u_lf_literal, row.u_hf_literal,
            row.listen_end_sec - row.listen_start_sec,
            DAYTIME_ENCODING[row.daytime_section] ?? 0,
        ],
        delta: {
            hr: row.r_hr_literal - row.u_hr_literal,
            rmssd: row.r_rmssd_literal - row.u_rmssd_literal,
            sdnn: row.r_sdnn_literal - row.u_sdnn_literal,
            pnn50: row.r_pnn50_literal - row.u_pnn50_literal,
            lf: row.r_lf_literal - row.u_lf_literal,
            hf: row.r_hf_literal - row.u_hf_literal,
        },
    }));

    // 3. Call ml_server /train
    let ml_res: Response;
    try {
        ml_res = await fetch(`${ML_BASE}/train`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cases }),
        });
    } catch (e) {
        return { data: null, error: e as Error };
    }

    if (!ml_res.ok) {
        const text = await ml_res.text().catch(() => '');
        return { data: null, error: new Error(`ml_server /train failed (${ml_res.status}): ${text}`) };
    }

    const { models, case_ids } = await ml_res.json() as {
        models: Record<string, unknown>;
        case_ids: number[];
    };

    // 4. Save new model to DB (deactivates old models for this user)
    const save_res = await DATABASE.Models.save(user_id, {
        model_hr: models.hr as any,
        model_rmssd: models.rmssd as any,
        model_sdnn: models.sdnn as any,
        model_pnn50: models.pnn50 as any,
        model_lf: models.lf as any,
        model_hf: models.hf as any,
    });
    if (save_res.error) return { data: null, error: save_res.error };
    const model_id = save_res.data!;

    // 5. Record which cases this model was trained on
    const td_res = await DATABASE.Models.save_training_data(model_id, case_ids);
    if (td_res.error) {
        // Non-fatal — model is saved, just log
        console.error('[ml] Failed to save training data record:', td_res.error);
    }

    return { data: model_id, error: null };
}

/** Threshold for auto-triggering a retrain */
export const RETRAIN_THRESHOLD = 100;

// ============================================================================
// Prediction / Ranking
// ============================================================================

export type HRVMap = { hr: number; rmssd: number; sdnn: number; pnn50: number; lf: number; hf: number };

/** Euclidean distance in the 6-dimensional HRV space. */
export function hrv_distance(a: HRVMap, b: HRVMap): number {
    return Math.sqrt(
        (a.hr - b.hr) ** 2 +
        (a.rmssd - b.rmssd) ** 2 +
        (a.sdnn - b.sdnn) ** 2 +
        (a.pnn50 - b.pnn50) ** 2 +
        (a.lf - b.lf) ** 2 +
        (a.hf - b.hf) ** 2
    );
}

function get_daytime_section(): number {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 0;  // morning
    if (hour >= 12 && hour < 17) return 1; // afternoon
    if (hour >= 17 && hour < 21) return 2; // evening
    return 3;                               // night
}

// Minimal shape needed from candidates to build a predict payload
type PredictableCandidate = {
    track_id: string;
    duration_s: number;
    tempo: number | null;
    tempo_std: number | null;
    mode: number | null;
    pulse_clarity: number | null;
    loud_mean: number | null;
    loud_std: number | null;
    loud_skewness: number | null;
    chroma_flux_mean: number | null;
    chroma_flux_std: number | null;
    chroma_flux_skewness: number | null;
    thumbnail_tempo: number | null;
    thumbnail_tempo_std: number | null;
    thumbnail_mode: number | null;
    thumbnail_pulse_clarity: number | null;
    thumbnail_loud_mean: number | null;
    thumbnail_loud_std: number | null;
    thumbnail_loud_skewness: number | null;
    thumbnail_chroma_flux_mean: number | null;
    thumbnail_chroma_flux_std: number | null;
    thumbnail_chroma_flux_skewness: number | null;
};

/**
 * Use the user's active XGBoost model to rank candidates by predicted HRV
 * distance to the goal state.
 *
 * Returns candidates with an added `distance` field, sorted ascending (best first),
 * together with the `model_id` of the model that was used.
 * Returns `{ data: null }` (no error) when the user has no active model yet —
 * caller should fall back to a simpler ranking.
 */
export async function rank_by_model<T extends PredictableCandidate>(
    candidates: T[],
    user_hrv: HRVMap,
    goal_hrv: HRVMap,
    user_id: string,
): Promise<Result<{ tracks: (T & { distance: number })[]; model_id: number } | null>> {
    if (candidates.length === 0) return { data: null, error: null };

    const model_res = await DATABASE.Models.get_active(user_id);
    if (model_res.error) return { data: null, error: model_res.error };
    const model = model_res.data;
    if (!model) return { data: null, error: null }; // no model yet — caller falls back

    const daytime = get_daytime_section();
    const cases = candidates.map(c => ({
        features: [
            c.tempo ?? 0, c.tempo_std ?? 0, c.mode ?? 0, c.pulse_clarity ?? 0,
            c.loud_mean ?? 0, c.loud_std ?? 0, c.loud_skewness ?? 0,
            c.chroma_flux_mean ?? 0, c.chroma_flux_std ?? 0, c.chroma_flux_skewness ?? 0,
            c.thumbnail_tempo ?? 0, c.thumbnail_tempo_std ?? 0, c.thumbnail_mode ?? 0, c.thumbnail_pulse_clarity ?? 0,
            c.thumbnail_loud_mean ?? 0, c.thumbnail_loud_std ?? 0, c.thumbnail_loud_skewness ?? 0,
            c.thumbnail_chroma_flux_mean ?? 0, c.thumbnail_chroma_flux_std ?? 0, c.thumbnail_chroma_flux_skewness ?? 0,
            user_hrv.hr, user_hrv.rmssd, user_hrv.sdnn, user_hrv.pnn50, user_hrv.lf, user_hrv.hf,
            c.duration_s,
            daytime,
        ],
    }));

    const models_json = {
        hr: model.model_hr,
        rmssd: model.model_rmssd,
        sdnn: model.model_sdnn,
        pnn50: model.model_pnn50,
        lf: model.model_lf,
        hf: model.model_hf,
    };

    let ml_res: Response;
    try {
        ml_res = await fetch(`${ML_BASE}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ models: models_json, cases }),
        });
    } catch (e) {
        return { data: null, error: e as Error };
    }

    if (!ml_res.ok) {
        const text = await ml_res.text().catch(() => '');
        return { data: null, error: new Error(`ml_server /predict failed (${ml_res.status}): ${text}`) };
    }

    const { predictions } = await ml_res.json() as { predictions: HRVMap[] };

    const ranked = candidates.map((c, i) => {
        const delta = predictions[i];
        const predicted_end: HRVMap = {
            hr:    user_hrv.hr    + delta.hr,
            rmssd: user_hrv.rmssd + delta.rmssd,
            sdnn:  user_hrv.sdnn  + delta.sdnn,
            pnn50: user_hrv.pnn50 + delta.pnn50,
            lf:    user_hrv.lf   + delta.lf,
            hf:    user_hrv.hf   + delta.hf,
        };
        return { ...c, distance: hrv_distance(predicted_end, goal_hrv) };
    }).sort((a, b) => a.distance - b.distance);

    return { data: { tracks: ranked, model_id: model.id }, error: null };
}
