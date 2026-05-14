import { Router } from "express";
import abort from './abort/index';
import { DATABASE } from '../../core/Database';
import { rank_by_phys_acous, type MoodState, type UserHRVStats } from '../../core/phys_acous';

const MOOD_STATES: MoodState[] = ['stress', 'amusement', 'baseline'];

const router = Router();

interface Prop {
    user_id: string;
    user_hrv: {
        hr: number;
        rmssd: number;
        sdnn: number;
        pnn50: number;
        lf: number;
        hf: number;
    };
    goal_hrv: {
        hr: number;
        rmssd: number;
        sdnn: number;
        pnn50: number;
        lf: number;
        hf: number;
    };
    limit?: number;
    predicted_mood?: MoodState;
};

const HRV_FIELDS = ['hr', 'rmssd', 'sdnn', 'pnn50', 'lf', 'hf'] as const;

export function validate_hrv(hrv: any, name: string): string | null {
    if (typeof hrv !== 'object' || hrv === null) return `${name} must be an object`;
    const missing = HRV_FIELDS.filter(f => typeof hrv[f] !== 'number');
    if (missing.length) return `${name} missing numeric fields: ${missing.join(', ')}`;
    return null;
}

/**
 * @swagger
 * /recommend:
 *   post:
 *     summary: Get personalised music recommendations based on current and goal HRV
 *     description: |
 *       Two-stage recommendation pipeline.
 *
 *       **Stage 1 — Candidate sampling**: Randomly draws up to 200 tracks from the
 *       database, excluding the user's 20 most recently listened tracks.
 *
 *       **Stage 2 — Ranking**: Uses the physioacoustic heuristic algorithm to score
 *       each candidate 0–100 based on how well its acoustic features (tempo, mode,
 *       pulse clarity, loudness dynamics, harmonic tension) are predicted to guide
 *       the user from their current HRV state toward `goal_hrv`.
 *
 *       The session is logged and the returned `reclog_id` should be passed to
 *       `/feedback` and `/recommend/abort` for full traceability.
 *     tags: [Recommend]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, user_hrv, goal_hrv]
 *             properties:
 *               user_id:
 *                 type: string
 *                 description: Unique user identifier (UUID).
 *               user_hrv:
 *                 $ref: '#/components/schemas/HRVMetrics'
 *                 description: User's current measured HRV state.
 *               goal_hrv:
 *                 $ref: '#/components/schemas/HRVMetrics'
 *                 description: Target HRV state the user wants to move toward.
 *               limit:
 *                 type: integer
 *                 default: 5
 *                 description: Maximum number of tracks to return (capped at 200).
 *               predicted_mood:
 *                 type: string
 *                 enum: [stress, amusement, baseline]
 *                 description: |
 *                   Optional mood state predicted by an external classifier (e.g. a
 *                   teammate's HRV-based ML model).  When provided, replaces the
 *                   default α-interpolated weight vector with a mood-specific preset:
 *                   - `stress`: maximise beat suppression and loudness stability
 *                   - `amusement`: tempo descent primary; major-key / harmonic richness allowed
 *                   - `baseline`: match tempo to HR, avoid sudden loudness; everything else neutral
 *                   Omitting this field falls back to pure α-based weight interpolation.
 *     responses:
 *       200:
 *         description: Recommendation list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reclog_id:
 *                   type: integer
 *                   nullable: true
 *                   description: >
 *                     Recommendation session log ID. Pass this to /feedback and /recommend/abort.
 *                     Returns null if the user_id does not exist in the users table (log skipped with a server-side warning).
 *                 ranked_by:
 *                   type: string
 *                   enum: [phys_acous]
 *                   description: 'Always "phys_acous". Score is 0–100, higher = better match.'
 *                 tracks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       track_id:      { type: string,  description: Internal track UUID. }
 *                       name:          { type: string,  description: Track title. }
 *                       duration_s:    { type: number,  description: Track duration in seconds. }
 *                       platform:      { type: string, enum: [jamendo, local], description: Source platform. }
 *                       platform_id:   { type: string,  description: Platform-specific track ID (e.g. Jamendo numeric ID). }
 *                       tempo:         { type: number,  description: Global weighted tempo in BPM. }
 *                       loud_mean:     { type: number,  description: Mean loudness across the track in dBFS. }
 *                       pulse_clarity: { type: number,  description: 'Beat salience score (0–1); higher = stronger rhythmic pulse.' }
 *                       mode:          { type: number,  description: 'Mode confidence (0 = minor, 1 = major).' }
 *                       score:         { type: number,  description: 'Physioacoustic score 0–100 (higher = better match toward goal_hrv).' }
 *       400:
 *         description: Invalid request body (missing or wrong-typed fields).
 *       500:
 *         description: Database or downstream service error.
 */
router.post('/', async (req, res) => {
    const { user_id, user_hrv, goal_hrv, limit = 5, predicted_mood } = req.body as Prop;

    if (typeof user_id !== 'string') {
        res.status(400).json({ error: 'user_id must be a string' });
        return;
    }
    if (predicted_mood !== undefined && !MOOD_STATES.includes(predicted_mood)) {
        res.status(400).json({ error: `predicted_mood must be one of: ${MOOD_STATES.join(', ')}` });
        return;
    }
    const user_hrv_err = validate_hrv(user_hrv, 'user_hrv');
    if (user_hrv_err) { res.status(400).json({ error: user_hrv_err }); return; }
    const goal_hrv_err = validate_hrv(goal_hrv, 'goal_hrv');
    if (goal_hrv_err) { res.status(400).json({ error: goal_hrv_err }); return; }
    if (typeof limit !== 'number') {
        res.status(400).json({ error: 'limit must be a number' });
        return;
    }

    // Pivot HR: goal clamped within ±15 % of current HR (entrainment safety window)
    // Candidate tempo range: ±10 % of the pivot
    const pivot_hr = Math.min(1.15 * user_hrv.hr, Math.max(0.85 * user_hrv.hr, goal_hrv.hr));
    const tempo_range: [number, number] = [pivot_hr * 0.9, pivot_hr * 1.1];

    // Fetch user HRV stats for z-scored α (daytime section = minutes since midnight)
    const now_date = new Date();
    const daytime_section = now_date.getHours() * 60 + now_date.getMinutes();
    const hrv_stats_res = await DATABASE.Users.get_hrv_stats(user_id, daytime_section);
    const user_hrv_stats: UserHRVStats | undefined = hrv_stats_res.data ?? undefined;

    // Stage 1: fetch candidates filtered by tempo range; history penalty handles recency
    const candidates = await DATABASE.Recommend.random_candidates([], 200, tempo_range);
    if (candidates.error || !candidates.data) {
        res.status(500).json({ error: 'Failed to fetch candidates' });
        return;
    }

    // Fetch listen history only for tracks in the candidate pool (reduces DB load)
    const candidate_ids = candidates.data.map(t => t.track_id);
    const history_res = await DATABASE.History.recent_with_timestamps(user_id, 3, candidate_ids);
    const recent_map = history_res.data ?? new Map<string, Date>();

    // Penalty(0h) = 50, Penalty(24h) = 5 → factor-of-10 drop per day
    // half-life = 24 / log₂(10) ≈ 7.22 h; derived from 50 × 2^(−24/T½) = 5
    const BASE_PENALTY = 50;
    const HALF_LIFE_MS = (24 / Math.log2(10)) * 60 * 60 * 1000;
    const now = Date.now();
    function listen_penalty(track_id: string): number {
        const last = recent_map.get(track_id);
        if (!last) return 0;
        const elapsed_ms = now - last.getTime();
        return BASE_PENALTY * Math.pow(2, -elapsed_ms / HALF_LIFE_MS);
    }

    // Stage 2: score, apply decay penalty, sort descending
    const score_opts = {
        ...(predicted_mood ? { mood_state: predicted_mood } : {}),
        ...(user_hrv_stats ? { user_hrv_stats } : {}),
    };
    const sorted = rank_by_phys_acous(candidates.data, user_hrv, goal_hrv, score_opts)
        .map(t => ({ ...t, score: t.phys_acous.total - listen_penalty(t.track_id) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    // Log recommendation
    const log = await DATABASE.Recommend.log(
        user_id,
        candidate_ids,
        user_hrv
    );
    if (log.error) {
        console.warn('[recommend] Failed to log recommendation (user may not exist in users table):', log.error);
    }

    res.status(200).json({ reclog_id: log.data ?? null, ranked_by: 'phys_acous', tracks: sorted });
});

router.use('/abort', abort);

export default router;