import { db } from "../types/database";
import type { ListenHistory, Track, TrackHrvEffPredict } from "../types/database_schema";
import type { Smoothness } from "../types/extract_complete_response";
import type { HR_RMSSD_LFHF } from "../types/metrix";
import { result, try_catch, type Result } from "../types/Result";
import { HRRadius, LFHFRadius, RMSSDRadius } from "./Constants";

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

    public static async tracks_by_hrv(HRV: HR_RMSSD_LFHF): Promise<Result<TrackHrvEffPredict[]>> {
        const res = await try_catch(db
            .selectFrom('track_hrv_eff_predict')
            .selectAll()
            .where('hr', '>=', HRV[0] - HRRadius)
            .where('hr', '<=', HRV[0] + HRRadius)
            .where('rmssd', '>=', HRV[1] - RMSSDRadius)
            .where('rmssd', '<=', HRV[1] + RMSSDRadius)
            .where('lfhf', '>=', HRV[2] - LFHFRadius)
            .where('lfhf', '<=', HRV[2] + LFHFRadius)
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
}