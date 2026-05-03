import { Router } from "express";
import { DATABASE } from "../../core/Database";
import { trigger_train, RETRAIN_THRESHOLD } from "../../core/ml";

const router = Router();

const VALID_DAYTIME_SECTIONS = ['morning', 'afternoon', 'evening', 'night'] as const;
const HRV_FIELDS = ['hr', 'rmssd', 'sdnn', 'pnn50', 'lf', 'hf'] as const;

function validate_hrv(hrv: any, name: string): string | null {
    if (typeof hrv !== 'object' || hrv === null) return `${name} must be an object`;
    const missing = HRV_FIELDS.filter(f => typeof hrv[f] !== 'number');
    if (missing.length) return `${name} missing numeric fields: ${missing.join(', ')}`;
    return null;
}

/**
 * @swagger
 * /feedback:
 *   post:
 *     summary: Record HRV observation before and after listening to a track
 *     tags: [Feedback]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, track_id, daytime_section, listen_segment, hrv_before, hrv_after]
 *             properties:
 *               user_id:  { type: string }
 *               track_id: { type: string }
 *               daytime_section:
 *                 type: string
 *                 enum: [morning, afternoon, evening, night]
 *               listen_segment:
 *                 type: object
 *                 required: [start_sec, end_sec]
 *                 properties:
 *                   start_sec: { type: number }
 *                   end_sec:   { type: number }
 *               hrv_before:    { $ref: '#/components/schemas/HRVMetrics' }
 *               hrv_after:     { $ref: '#/components/schemas/HRVMetrics' }
 *               mental_status:
 *                 type: object
 *                 properties:
 *                   before: { type: string }
 *                   after:  { type: string }
 *               reclog_id:   { type: integer }
 *               baseline_id: { type: integer }
 *     responses:
 *       200:
 *         description: Feedback recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 feedback_id: { type: integer }
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Server error
 */

interface Prop {
    user_id: string;
    track_id: string;
    daytime_section: string;
    listen_segment: { start_sec: number; end_sec: number };
    hrv_before: {
        hr: number; rmssd: number; sdnn: number; pnn50: number; lf: number; hf: number;
    };
    hrv_after: {
        hr: number; rmssd: number; sdnn: number; pnn50: number; lf: number; hf: number;
    };
    mental_status?: { before?: string; after?: string };
    reclog_id?: number;
    baseline_id?: number;
}

router.post('/', async (req, res) => {
    const {
        user_id, track_id, daytime_section,
        listen_segment, hrv_before, hrv_after,
        mental_status, reclog_id = null, baseline_id = null,
    } = req.body as Prop;

    // Type and existence checks
    if (typeof user_id !== 'string') {
        res.status(400).json({ error: 'user_id must be a string' });
        return;
    }
    if (typeof track_id !== 'string') {
        res.status(400).json({ error: 'track_id must be a string' });
        return;
    }
    if (typeof daytime_section !== 'string' || !VALID_DAYTIME_SECTIONS.includes(daytime_section as any)) {
        res.status(400).json({ error: `daytime_section must be one of: ${VALID_DAYTIME_SECTIONS.join(', ')}` });
        return;
    }

    // listen_segment validation
    if (typeof listen_segment !== 'object' || listen_segment === null) {
        res.status(400).json({ error: 'listen_segment must be an object' });
        return;
    }
    if (typeof listen_segment.start_sec !== 'number' || typeof listen_segment.end_sec !== 'number') {
        res.status(400).json({ error: 'listen_segment.start_sec and end_sec must be numbers' });
        return;
    }
    if (listen_segment.start_sec < 0 || listen_segment.end_sec < 0) {
        res.status(400).json({ error: 'listen_segment.start_sec and end_sec must be non-negative' });
        return;
    }
    if (listen_segment.start_sec >= listen_segment.end_sec) {
        res.status(400).json({ error: 'listen_segment.start_sec must be less than end_sec' });
        return;
    }

    // HRV validation
    const hrv_before_err = validate_hrv(hrv_before, 'hrv_before');
    if (hrv_before_err) { res.status(400).json({ error: hrv_before_err }); return; }
    const hrv_after_err = validate_hrv(hrv_after, 'hrv_after');
    if (hrv_after_err) { res.status(400).json({ error: hrv_after_err }); return; }

    // Optional baseline_id type check
    if (baseline_id !== null && typeof baseline_id !== 'number') {
        res.status(400).json({ error: 'baseline_id must be a number' });
        return;
    }
    if (reclog_id !== null && typeof reclog_id !== 'number') {
        res.status(400).json({ error: 'reclog_id must be a number' });
        return;
    }
    const [feedback, hist] = await Promise.all([
        DATABASE.Recommend.insert_physical_feedback({
            user_id, track_id, daytime_section: daytime_section as any,
            listen_start_sec: listen_segment.start_sec,
            listen_end_sec: listen_segment.end_sec,
            u_hr_literal: hrv_before.hr,
            u_rmssd_literal: hrv_before.rmssd,
            u_sdnn_literal: hrv_before.sdnn,
            u_pnn50_literal: hrv_before.pnn50,
            u_lf_literal: hrv_before.lf,
            u_hf_literal: hrv_before.hf,
            r_hr_literal: hrv_after.hr,
            r_rmssd_literal: hrv_after.rmssd,
            r_sdnn_literal: hrv_after.sdnn,
            r_pnn50_literal: hrv_after.pnn50,
            r_lf_literal: hrv_after.lf,
            r_hf_literal: hrv_after.hf,
            reclog_id, baseline_id,
            u_mental_status: mental_status?.before ?? null,
            r_mental_status: mental_status?.after ?? null,
        }),
        DATABASE.History.insert(user_id, track_id),
    ]);

    if (feedback.error) {
        res.status(500).json({ error: 'Failed to save feedback' });
        return;
    }
    if (hist.error) {
        res.status(500).json({ error: 'Failed to save listen history' });
        return;
    }

    res.json({ feedback_id: feedback.data });

    // Auto-trigger retrain (fire-and-forget) when feedback count hits threshold
    DATABASE.Models.count_feedback(user_id).then(count_res => {
        if (!count_res.error && count_res.data! % RETRAIN_THRESHOLD === 0) {
            trigger_train(user_id).then(train_res => {
                if (train_res.error) {
                    console.error(`[ml] Auto-train failed for user ${user_id}:`, train_res.error);
                } else {
                    console.log(`[ml] Auto-train complete for user ${user_id}, model_id=${train_res.data}`);
                }
            });
        }
    });
});

export default router;