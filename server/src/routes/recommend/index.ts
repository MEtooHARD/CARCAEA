import { Router } from "express";
import abort from './abort/index';
import { DATABASE } from '../../core/Database';

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
 *     summary: Get music recommendations based on current and goal HRV
 *     tags: [Recommend]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, user_hrv, goal_hrv]
 *             properties:
 *               user_id:  { type: string }
 *               user_hrv: { $ref: '#/components/schemas/HRVMetrics' }
 *               goal_hrv: { $ref: '#/components/schemas/HRVMetrics' }
 *               limit:    { type: integer, default: 5, description: Max tracks to return }
 *     responses:
 *       200:
 *         description: Recommendation list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reclog_id: { type: integer }
 *                 tracks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       track_id:      { type: string }
 *                       name:          { type: string }
 *                       duration_s:    { type: number }
 *                       tempo:         { type: number }
 *                       loud_mean:     { type: number }
 *                       pulse_clarity: { type: number }
 *                       mode:          { type: number }
 *                       score:         { type: number }
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Server error
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

    // Stage 2: sort by |tempo - goal_hr| ascending, return top limit
    const sorted = candidates.data
        .map(t => ({ ...t, score: Math.abs(t.tempo - goal_hrv.hr) }))
        .sort((a, b) => a.score - b.score)
        .slice(0, limit);

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

    res.json({ reclog_id: log.data, tracks: sorted });
});

router.use('/abort', abort);

export default router;