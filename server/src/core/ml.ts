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
