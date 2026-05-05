import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import type { Insertable, Selectable } from 'kysely';
import type { DB, TrackAudioFeatures, TrackFeatEnvelopes, TrackMetadata, UserHrvBaseline, PhysicalFeedback, XgbModels } from '../types/database_schema';
import { try_catch, type Result } from '../types/Result';
import { postgres_user, postgres_password, postgres_db_name, database_name, database_port } from '../config';

// ============================================================================
// Kysely instance — use DATABASE_URL if provided (docker), else fallback to parts
// ============================================================================

const pool = new Pool({
    host: database_name,
    port: Number(database_port) || 5432,
    database: postgres_db_name,
    user: postgres_user,
    password: postgres_password,
});

export const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

// ============================================================================
// Domain: Tracks
// ============================================================================

const Tracks = {

    async find_by_id(track_id: string) {
        return try_catch(
            db.selectFrom('track')
                .where('track_id' as any, '=', track_id)
                .selectAll()
                .executeTakeFirst()
        );
    },

    async find_by_platform(platform: 'jamendo' | 'local', platform_id: string) {
        return try_catch(
            db.selectFrom('track_platform')
                .innerJoin('track', 'track.id', 'track_platform.track_id')
                .where('track_platform.platform', '=', platform)
                .where('track_platform.platform_id', '=', platform_id)
                .select(['track.id', 'track.name', 'track.duration_s', 'track.hidden'])
                .executeTakeFirst()
        );
    },

    async insert(id: string, name: string, duration_s: number): Promise<Result<void>> {
        return try_catch(
            db.insertInto('track')
                .values({ id, name, duration_s })
                .onConflict(oc => oc.doNothing())
                .execute()
                .then(() => undefined)
        );
    },

    async insert_platform(track_id: string, platform: 'jamendo' | 'local', platform_id: string): Promise<Result<void>> {
        return try_catch(
            db.insertInto('track_platform')
                .values({ track_id, platform, platform_id })
                .onConflict(oc => oc.doNothing())
                .execute()
                .then(() => undefined)
        );
    },

    async upsert_metadata(track_id: string, meta: Omit<Insertable<TrackMetadata>, 'track_id'>): Promise<Result<void>> {
        return try_catch(
            db.insertInto('track_metadata')
                .values({ track_id, ...meta })
                .onConflict(oc => oc.column('track_id').doUpdateSet(meta as any))
                .execute()
                .then(() => undefined)
        );
    },

    async upsert_features(track_id: string, features: Omit<Insertable<TrackAudioFeatures>, 'track_id'>): Promise<Result<void>> {
        return try_catch(
            db.insertInto('track_audio_features')
                .values({ track_id, ...features })
                .onConflict(oc => oc.column('track_id').doUpdateSet(features as any))
                .execute()
                .then(() => undefined)
        );
    },

    async upsert_envelopes(track_id: string, envelopes: Omit<Insertable<TrackFeatEnvelopes>, 'track_id'>): Promise<Result<void>> {
        return try_catch(
            db.insertInto('track_feat_envelopes')
                .values({ track_id, ...envelopes })
                .onConflict(oc => oc.column('track_id').doUpdateSet(envelopes as any))
                .execute()
                .then(() => undefined)
        );
    },

    async list_with_features(limit = 100, offset = 0) {
        return try_catch(
            db.selectFrom('track')
                .innerJoin('track_audio_features', 'track_audio_features.track_id', 'track.id')
                .where('track.hidden', '=', false)
                .selectAll()
                .limit(limit)
                .offset(offset)
                .execute()
        );
    },

    async get_envelopes(track_id: string) {
        return try_catch(
            db.selectFrom('track_feat_envelopes')
                .where('track_id', '=', track_id)
                .selectAll()
                .executeTakeFirst()
        );
    },
};

// ============================================================================
// Domain: Users
// ============================================================================

const Users = {

    async find(user_id: string) {
        return try_catch(
            db.selectFrom('users')
                .where('id', '=', user_id)
                .selectAll()
                .executeTakeFirst()
        );
    },

    async insert(id: string, name: string): Promise<Result<void>> {
        return try_catch(
            db.insertInto('users')
                .values({ id, name })
                .onConflict(oc => oc.doNothing())
                .execute()
                .then(() => undefined)
        );
    },

    async update(id: string, name: string): Promise<Result<void>> {
        return try_catch(
            db.updateTable('users')
                .set({ name })
                .where('id', '=', id)
                .execute()
                .then(() => undefined)
        );
    },

    async insert_baseline(
        user_id: string,
        baseline: Omit<Insertable<UserHrvBaseline>, 'user_id'>
    ): Promise<Result<number>> {
        return try_catch(
            db.insertInto('user_hrv_baseline')
                .values({ user_id, ...baseline })
                .returning('id')
                .executeTakeFirstOrThrow()
                .then(r => r.id)
        );
    },

    async get_latest_baseline(user_id: string, daytime_section: number) {
        return try_catch(
            db.selectFrom('user_hrv_baseline')
                .where('user_id', '=', user_id)
                .where('daytime_section', '=', daytime_section as any)
                .orderBy('timestamp', 'desc')
                .selectAll()
                .executeTakeFirst()
        );
    },
};

// ============================================================================
// Domain: Models
// ============================================================================

const Models = {

    async get_active(user_id: string): Promise<Result<Selectable<XgbModels> | undefined>> {
        return try_catch(
            db.selectFrom('xgb_models')
                .where('user_id', '=', user_id)
                .where('active', '=', true)
                .orderBy('timestamp', 'desc')
                .selectAll()
                .executeTakeFirst()
        );
    },

    async save(
        user_id: string,
        models: Pick<Insertable<XgbModels>, 'model_hr' | 'model_rmssd' | 'model_sdnn' | 'model_pnn50' | 'model_lf' | 'model_hf'>
    ): Promise<Result<number>> {
        return try_catch(
            db.transaction().execute(async (trx) => {
                // deactivate all previous models for this user
                await trx.updateTable('xgb_models')
                    .set({ active: false })
                    .where('user_id', '=', user_id)
                    .execute();

                const inserted = await trx.insertInto('xgb_models')
                    .values({ user_id, active: true, ...models })
                    .returning('id')
                    .executeTakeFirstOrThrow();

                return inserted.id;
            })
        );
    },

    async list(user_id: string): Promise<Result<Selectable<XgbModels>[]>> {
        return try_catch(
            db.selectFrom('xgb_models')
                .where('user_id', '=', user_id)
                .orderBy('timestamp', 'desc')
                .selectAll()
                .execute()
        );
    },

    async activate(model_id: number, user_id: string): Promise<Result<void>> {
        return try_catch(
            db.transaction().execute(async (trx) => {
                await trx.updateTable('xgb_models')
                    .set({ active: false })
                    .where('user_id', '=', user_id)
                    .execute();
                await trx.updateTable('xgb_models')
                    .set({ active: true })
                    .where('id', '=', model_id)
                    .where('user_id', '=', user_id)
                    .execute();
            }).then(() => undefined)
        );
    },

    async save_training_data(model_id: number, case_ids: number[]): Promise<Result<void>> {
        return try_catch(
            db.insertInto('model_training_data')
                .values({ model_id, case_ids })
                .execute()
                .then(() => undefined)
        );
    },

    async count_feedback(user_id: string): Promise<Result<number>> {
        return try_catch(
            db.selectFrom('physical_feedback')
                .where('user_id', '=', user_id)
                .select(db.fn.countAll<number>().as('count'))
                .executeTakeFirstOrThrow()
                .then(r => Number(r.count))
        );
    },

    async get_training_cases(user_id: string) {
        return try_catch(
            db.selectFrom('physical_feedback as pf')
                .innerJoin('track_audio_features as taf', 'taf.track_id', 'pf.track_id')
                .where('pf.user_id', '=', user_id)
                .orderBy('pf.timestamp', 'desc')
                .select([
                    'pf.id as feedback_id',
                    'pf.daytime_section',
                    'pf.listen_start_sec',
                    'pf.listen_end_sec',
                    'pf.u_hr_literal', 'pf.u_rmssd_ln', 'pf.u_sdnn_literal',
                    'pf.u_pnn50_literal', 'pf.u_lf_ln', 'pf.u_hf_ln',
                    'pf.r_hr_literal', 'pf.r_rmssd_ln', 'pf.r_sdnn_literal',
                    'pf.r_pnn50_literal', 'pf.r_lf_ln', 'pf.r_hf_ln',
                    'taf.tempo', 'taf.tempo_std', 'taf.mode', 'taf.pulse_clarity',
                    'taf.loud_mean', 'taf.loud_std', 'taf.loud_skewness',
                    'taf.chroma_flux_mean', 'taf.chroma_flux_std', 'taf.chroma_flux_skewness',
                    'taf.thumbnail_tempo', 'taf.thumbnail_tempo_std', 'taf.thumbnail_mode',
                    'taf.thumbnail_pulse_clarity', 'taf.thumbnail_loud_mean',
                    'taf.thumbnail_loud_std', 'taf.thumbnail_loud_skewness',
                    'taf.thumbnail_chroma_flux_mean', 'taf.thumbnail_chroma_flux_std',
                    'taf.thumbnail_chroma_flux_skewness',
                ])
                .execute()
        );
    },
};

// ============================================================================
// Domain: Recommendations & Predictions
// ============================================================================

const Recommend = {

    async log(
        user_id: string,
        candidate_track_ids: string[],
        u_hrv_literal_at_request: object
    ): Promise<Result<number>> {
        return try_catch(
            db.insertInto('recommendation_log')
                .values({
                    user_id,
                    candidate_track_ids,
                    u_hrv_literal_at_request: JSON.stringify(u_hrv_literal_at_request) as any,
                })
                .returning('id')
                .executeTakeFirstOrThrow()
                .then(r => r.id)
        );
    },

    async log_abort(
        user_id: string,
        reclog_id: number,
        original_track_id: string,
        alternate_track_id: string | null
    ): Promise<Result<void>> {
        return try_catch(
            db.insertInto('abort_rec_log')
                .values({ user_id, reclog_id, original_track_id, alternate_track_id })
                .execute()
                .then(() => undefined)
        );
    },

    async insert_physical_feedback(record: Omit<Insertable<PhysicalFeedback>, 'id' | 'timestamp'>): Promise<Result<number>> {
        return try_catch(
            db.insertInto('physical_feedback')
                .values(record)
                .returning('id')
                .executeTakeFirstOrThrow()
                .then(r => r.id)
        );
    },

    async get_user_physical_feedback(user_id: string, limit = 200) {
        return try_catch(
            db.selectFrom('physical_feedback')
                .where('user_id', '=', user_id)
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .selectAll()
                .execute()
        );
    },

    /** Random N non-hidden tracks with audio features, excluding given track IDs. */
    async random_candidates(exclude_ids: string[], n = 200) {
        let query = db.selectFrom('track')
            .innerJoin('track_audio_features', 'track_audio_features.track_id', 'track.id')
            .innerJoin('track_platform', 'track_platform.track_id', 'track.id')
            .where('track.hidden', '=', false)
            .select([
                'track.id as track_id',
                'track.name',
                'track.duration_s',
                'track_platform.platform',
                'track_platform.platform_id',
                'track_audio_features.tempo',
                'track_audio_features.tempo_std',
                'track_audio_features.mode',
                'track_audio_features.pulse_clarity',
                'track_audio_features.loud_mean',
                'track_audio_features.loud_std',
                'track_audio_features.loud_skewness',
                'track_audio_features.chroma_flux_mean',
                'track_audio_features.chroma_flux_std',
                'track_audio_features.chroma_flux_skewness',
                'track_audio_features.thumbnail_tempo',
                'track_audio_features.thumbnail_tempo_std',
                'track_audio_features.thumbnail_mode',
                'track_audio_features.thumbnail_pulse_clarity',
                'track_audio_features.thumbnail_loud_mean',
                'track_audio_features.thumbnail_loud_std',
                'track_audio_features.thumbnail_loud_skewness',
                'track_audio_features.thumbnail_chroma_flux_mean',
                'track_audio_features.thumbnail_chroma_flux_std',
                'track_audio_features.thumbnail_chroma_flux_skewness',
            ])
            .orderBy(sql`random()`)
            .limit(n);

        if (exclude_ids.length > 0) {
            query = query.where('track.id', 'not in', exclude_ids as any);
        }

        return try_catch(query.execute());
    },
};

// ============================================================================
// Domain: Listen History
// ============================================================================

const History = {

    async insert(user_id: string, track_id: string): Promise<Result<void>> {
        return try_catch(
            db.insertInto('listen_history')
                .values({ user_id, track_id })
                .execute()
                .then(() => undefined)
        );
    },

    async recent(user_id: string, limit = 20): Promise<Result<string[]>> {
        return try_catch(
            db.selectFrom('listen_history')
                .where('user_id', '=', user_id)
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .select('track_id')
                .execute()
                .then(rows => rows.map(r => r.track_id))
        );
    },
};


export class DATABASE {
    public static readonly Tracks = Tracks;
    public static readonly Users = Users;
    public static readonly Models = Models;
    public static readonly Recommend = Recommend;
    public static readonly History = History;
}