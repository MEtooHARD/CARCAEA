import { Router } from "express";
import abort from './abort/index';
import { DATABASE } from '../../core/Database';
import { rank_by_model } from '../../core/ml';

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
 *       **Stage 2 — Ranking**: If the user has an active personal XGBoost model,
 *       each candidate is scored by predicting the HRV change the song would induce
 *       for this user (given current HRV state and time-of-day context), then computing
 *       the Euclidean distance between the predicted HRV end-state and `goal_hrv`.
 *       Candidates are sorted ascending by distance (closest to goal = best match).
 *       When no personal model exists yet, a heuristic `|tempo − goal_hrv.hr|` is used.
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
 *                   description: Recommendation session log ID. Pass this to /feedback and /recommend/abort.
 *                 ranked_by:
 *                   type: string
 *                   enum: [model, heuristic]
 *                   description: '"model" when the user''s personal XGBoost model was used; "heuristic" when no model is available yet (sorts by |tempo − goal_hrv.hr|).'
 *                 model_id:
 *                   type: integer
 *                   nullable: true
 *                   description: ID of the XGBoost model used for ranking; null when ranked_by is "heuristic".
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
 *                       score:         { type: number,  description: 'Model: L2 distance of predicted HRV end-state to goal_hrv (lower = better match). Heuristic: |tempo − goal_hrv.hr|.' }
 *       400:
 *         description: Invalid request body (missing or wrong-typed fields).
 *       500:
 *         description: Database or downstream service error.
 */
router.post('/', async (req, res) => {
    const { user_id, user_hrv, goal_hrv, limit = 5 } = req.body as Prop;

    if (typeof user_id !== 'string') {
        res.status(400).json({ error: 'user_id must be a string' });
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

    // Stage 1: exclude recently listened, fetch 200 random candidates
    const recent = await DATABASE.History.recent(user_id, 20);
    if (recent.error) {
        res.status(500).json({ error: 'Failed to fetch listen history' });
        return;
    }
    const exclude_ids = recent.data ?? [];

    const candidates = await DATABASE.Recommend.random_candidates(exclude_ids, 200);
    if (candidates.error || !candidates.data) {
        res.status(500).json({ error: 'Failed to fetch candidates' });
        return;
    }

    // Stage 2: rank candidates — prefer personal model, fall back to heuristic
    let sorted: (typeof candidates.data[number] & { score: number })[];
    let ranked_by: 'model' | 'heuristic' = 'heuristic';
    let used_model_id: number | null = null;

    const model_ranked = await rank_by_model(candidates.data, user_hrv, goal_hrv, user_id);
    if (model_ranked.error) {
        console.warn('[recommend] rank_by_model failed, falling back:', model_ranked.error.message);
    }

    if (model_ranked.data) {
        // Personal model available: sort by predicted HRV distance to goal
        ranked_by = 'model';
        used_model_id = model_ranked.data.model_id;
        sorted = model_ranked.data.tracks.slice(0, limit).map(t => ({ ...t, score: t.distance }));
    } else {
        // No model yet: heuristic |tempo − goal_hrv.hr|
        sorted = candidates.data
            .map(t => ({ ...t, score: Math.abs(t.tempo - goal_hrv.hr) }))
            .sort((a, b) => a.score - b.score)
            .slice(0, limit);
    }

    // Log recommendation
    const candidate_ids = candidates.data.map(t => t.track_id);
    const log = await DATABASE.Recommend.log(
        user_id,
        candidate_ids,
        user_hrv
    );
    if (log.error) {
        res.status(500).json({ error: 'Failed to log recommendation' });
        return;
    }

    res.status(200).json({ reclog_id: log.data, ranked_by, model_id: used_model_id, tracks: sorted });
});

router.use('/abort', abort);

export default router;