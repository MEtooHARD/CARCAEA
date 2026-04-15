import { db } from "../types/database";
import type { Track, TrackHrvEffPredict } from "../types/database_schema";
import type { HR_RMSSD_LFHF } from "../types/metrix";
import { result, try_catch, type Result } from "../types/Result";

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

    public static async tracks_by_hrv(HRV: HR_RMSSD_LFHF, r: number): Promise<Result<TrackHrvEffPredict[]>> {
        const res = await try_catch(db
            .selectFrom('track_hrv_eff_predict')
            .selectAll()
            .where('hr', '>=', HRV[0] - r)
            .where('hr', '<=', HRV[0] + r)
            .where('emssd', '>=', HRV[1] - r)
            .where('emssd', '<=', HRV[1] + r)
            .where('lfhf', '>=', HRV[2] - r)
            .where('lfhf', '<=', HRV[2] + r)
            .execute() as unknown as Promise<TrackHrvEffPredict[]>
        );

        if (res.error)
            return { data: null, error: res.error };

        return result(res.data);
    }
}