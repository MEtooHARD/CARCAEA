import { db } from "../types/database";
import type { ListenHistory, Track, TrackGlobalRisks, TrackHrvEffPredict, TrackPlatform, TrackPredictionsMeta } from "../types/database_schema";
import type { Smoothness } from "../types/extract_complete_response";
import type { HR_RMSSD_LFHF } from "../types/metrix";
import { result, try_catch, type Result } from "../types/Result";
import { HRV } from "./Constants";
import { search_cube_bound } from "./eval";

export type TrackInfo = {
    track: Track;
    track_global_risks?: Omit<TrackGlobalRisks, 'track_id'>;
    track_hrv_eff_predict?: Omit<TrackHrvEffPredict, 'track_id' | 'timestamp'>;
    track_platform?: Omit<TrackPlatform, 'track_id'>;
    track_predictions_meta?: Omit<TrackPredictionsMeta, 'track_id'>;
}

export class Retrieval {

    private constructor() { }

    public static async get_track(id: string): Promise<Result<Track>> {
        const res = await try_catch(db
            .selectFrom('track')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst());

        if (res.error)
            return { data: null, error: res.error };

        if (!res.data)
            return { data: null, error: new Error(`Track with id ${id} not found`) };

        return result(res.data);
    }

    public static async tracks_by_hrv(hrv: HR_RMSSD_LFHF): Promise<Result<TrackHrvEffPredict[]>> {

        const bounds = search_cube_bound({ [HRV.HR]: hrv[HRV.HR], [HRV.RMSSD]: hrv[HRV.RMSSD], [HRV.LFHF]: hrv[HRV.LFHF] });

        const res = await try_catch(db
            .selectFrom('track_hrv_eff_predict')
            .selectAll()
            .where('hr', '>=', hrv[0] - bounds[HRV.HR].dn)
            .where('hr', '<=', hrv[0] + bounds[HRV.HR].up)
            .where('rmssd', '>=', hrv[1] - bounds[HRV.RMSSD].dn)
            .where('rmssd', '<=', hrv[1] + bounds[HRV.RMSSD].up)
            .where('lfhf', '>=', hrv[2] - bounds[HRV.LFHF].dn)
            .where('lfhf', '<=', hrv[2] + bounds[HRV.LFHF].up)
            .where('rmssd', 'is not', null)
            .execute() as unknown as Promise<TrackHrvEffPredict[]>
        );

        if (res.error)
            return { data: null, error: res.error };

        return result(res.data);
    }

    public static async smoothness(track_id: string): Promise<Result<Smoothness>> {
        const res = await try_catch(db
            .selectFrom('track_predictions_meta')
            .select('smoothness')
            .where('track_id', '=', track_id)
            .executeTakeFirst()
        );

        if (res.error)
            return { data: null, error: res.error };

        if (!res.data)
            return { data: null, error: new Error(`Smoothness metrics for track ${track_id} not found`) };

        return result(res.data.smoothness as unknown as Smoothness);
    }

    public static async smoothness_batch(track_ids: string[]): Promise<Result<Array<{ track_id: string, smoothness: Smoothness }>>> {
        const res = await try_catch(db
            .selectFrom('track_predictions_meta')
            .select(['track_id', 'smoothness'])
            .where('track_id', 'in', track_ids)
            .execute()
        );

        if (res.error)
            return { data: null, error: res.error };

        return result(res.data as unknown as Array<{ track_id: string, smoothness: Smoothness }>);
    }

    public static async recent_tracks(user_id: string, limit: number = 20, time_limit: number = 3600): Promise<Result<Omit<ListenHistory, 'user_id'>[]>> {
        const cutoff_time = new Date(Date.now() - time_limit * 1000);

        const res = await try_catch(db
            .selectFrom('listen_history')
            .select(['track_id', 'timestamp'])
            .where('user_id', '=', user_id)
            .where('timestamp', '>=', cutoff_time)
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .execute()
        );

        if (res.error)
            return { data: null, error: res.error };

        return result(res.data as unknown as Omit<ListenHistory, 'user_id'>[]);
    }

    public static async track_info(track_ids: string[]): Promise<Result<TrackInfo[]>> {
        const res = await try_catch(db
            .selectFrom('track')
            .selectAll()
            .leftJoin('track_global_risks', 'track.id', 'track_global_risks.track_id')
            .select([
                'track_global_risks.mode',
                'track_global_risks.mode_score',
                'track_global_risks.pulse_clarity',
                'track_global_risks.tempo_category',
                'track_global_risks.tempo_bpm',
                'track_global_risks.tempo_score',
                'track_global_risks.dynamic_range_db',
                'track_global_risks.mean_loudness_db',
                'track_global_risks.mean_f0_hz',
                'track_global_risks.f0_range_hz',
            ])
            .leftJoin('track_hrv_eff_predict', 'track.id', 'track_hrv_eff_predict.track_id')
            .select([
                'track_hrv_eff_predict.hr',
                'track_hrv_eff_predict.rmssd',
                'track_hrv_eff_predict.lfhf',
            ])
            .leftJoin('track_platform', 'track.id', 'track_platform.track_id')
            .select([
                'track_platform.platform',
                'track_platform.platform_id',
            ])
            .leftJoin('track_predictions_meta', 'track.id', 'track_predictions_meta.track_id')
            .select([
                'track_predictions_meta.mode_mean',
                'track_predictions_meta.pulse_clarity_mean',
                'track_predictions_meta.tempo_mean_bpm',
                'track_predictions_meta.music_envelope_mean',
                'track_predictions_meta.music_envelope_std',
                'track_predictions_meta.f0_envelope_mean_hz',
                'track_predictions_meta.f0_midi_mean',
                'track_predictions_meta.f0_midi_variance',
                'track_predictions_meta.f0_midi_std',
                'track_predictions_meta.loudness_envelope_mean',
                'track_predictions_meta.loudness_stability',
                'track_predictions_meta.smoothness',
            ])
            .where('track.id', 'in', track_ids)
            .execute()
        );

        if (res.error)
            return { data: null, error: res.error };

        const data = (res.data as any[]).map(row => ({
            track: {
                id: row.id,
                name: row.name,
                duration_s: row.duration_s,
                global_confidence: row.global_confidence,
                thumbnail_start: row.thumbnail_start,
                thumbnail_end: row.thumbnail_end,
                thumbnail_duration: row.thumbnail_duration,
            },
            track_global_risks: row.mode ? {
                mode: row.mode,
                mode_score: row.mode_score,
                pulse_clarity: row.pulse_clarity,
                tempo_category: row.tempo_category,
                tempo_bpm: row.tempo_bpm,
                tempo_score: row.tempo_score,
                dynamic_range_db: row.dynamic_range_db,
                mean_loudness_db: row.mean_loudness_db,
                mean_f0_hz: row.mean_f0_hz,
                f0_range_hz: row.f0_range_hz,
            } : undefined,
            track_hrv_eff_predict: row.hr !== null ? {
                hr: row.hr,
                rmssd: row.rmssd,
                lfhf: row.lfhf,
            } : undefined,
            track_platform: row.platform ? {
                platform: row.platform,
                platform_id: row.platform_id,
            } : undefined,
            track_predictions_meta: row.mode_mean !== null ? {
                mode_mean: row.mode_mean,
                pulse_clarity_mean: row.pulse_clarity_mean,
                tempo_mean_bpm: row.tempo_mean_bpm,
                music_envelope_mean: row.music_envelope_mean,
                music_envelope_std: row.music_envelope_std,
                f0_envelope_mean_hz: row.f0_envelope_mean_hz,
                f0_midi_mean: row.f0_midi_mean,
                f0_midi_variance: row.f0_midi_variance,
                f0_midi_std: row.f0_midi_std,
                loudness_envelope_mean: row.loudness_envelope_mean,
                loudness_stability: row.loudness_stability,
                smoothness: row.smoothness,
            } : undefined,
        })) as TrackInfo[];

        return result(data);
    }
}