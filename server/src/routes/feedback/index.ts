import { Router } from "express";
import { DATABASE, db } from "../../core/Database";
import { trigger_train, RETRAIN_THRESHOLD } from "../../core/ml";
import { download_and_import_jamendo } from "../../core/import/handlers";

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
 *     summary: Record HRV change observed while listening to a track
 *     description: |
 *       Submits a single training observation: the user's HRV state immediately before
 *       and after listening to a track segment. This data is used to train and refine the
 *       user's personal XGBoost model.
 *
 *       **Track resolution**: At least one of `track_id` or `jamendo_id` must be provided.
 *       - If `track_id` matches a visible track in the database, feedback is recorded synchronously (HTTP 200).
 *       - If the track is not in the database but `jamendo_id` is provided, the server responds immediately
 *         with HTTP 202, then downloads the audio from Jamendo, extracts features, imports the track,
 *         and records the feedback in the background.
 *       - If neither condition is met, HTTP 404 is returned and no feedback is recorded.
 *
 *       **Auto-retrain**: Every `RETRAIN_THRESHOLD` (100) feedback records for a user,
 *       a full model retrain is triggered automatically in the background.
 *     tags: [Feedback]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, session_id, index_in_session, gap_sec, daytime_section, listen_segment, hrv_before, hrv_during, goal_hrv]
 *             description: 'At least one of track_id or jamendo_id must be provided.'
 *             properties:
 *               user_id:
 *                 type: string
 *                 description: Unique user identifier (UUID).
 *               track_id:
 *                 type: string
 *                 description: Internal track UUID. Omit if the track is not yet in the database.
 *               jamendo_id:
 *                 type: integer
 *                 description: Jamendo numeric track ID. Required when track_id is absent or not found in the database; triggers on-demand download and import.
 *               session_id:
 *                 type: string
 *                 description: Client-generated UUID identifying the listening session. All tracks listened in one continuous session share the same session_id.
 *               index_in_session:
 *                 type: integer
 *                 description: Zero-based position of this track within the session (0 = first track listened).
 *               gap_sec:
 *                 type: number
 *                 description: Elapsed time in seconds between the end of the previous track and the start of this one (0 for the first track in a session).
 *               daytime_section:
 *                 type: string
 *                 enum: [morning, afternoon, evening, night]
 *                 description: Time-of-day bucket when listening occurred. Used as a feature for the personal model.
 *               listen_segment:
 *                 type: object
 *                 required: [start_sec, end_sec]
 *                 description: The portion of the track the user actually listened to.
 *                 properties:
 *                   start_sec: { type: number, description: Playback start position in seconds (≥ 0). }
 *                   end_sec:   { type: number, description: Playback end position in seconds (> start_sec). }
 *               hrv_before:
 *                 type: object
 *                 description: |
 *                   Mean HRV measured in the 1–2 minutes before the track started.
 *                   `hr`, `sdnn`, `pnn50` are raw values; `rmssd`, `lf`, `hf` must be
 *                   E[ln(x)] (natural-log scale), matching the stored column format.
 *                 properties:
 *                   hr:    { type: number, description: Mean heart rate (bpm). }
 *                   rmssd: { type: number, description: 'E[ln(rmssd)] — natural log of rmssd (ms).' }
 *                   sdnn:  { type: number, description: SDNN (ms). }
 *                   pnn50: { type: number, description: 'pNN50 (%).' }
 *                   lf:    { type: number, description: 'E[ln(LF)] — natural log of LF power (ms²).' }
 *                   hf:    { type: number, description: 'E[ln(HF)] — natural log of HF power (ms²).' }
 *               hrv_during:
 *                 type: object
 *                 description: |
 *                   Mean HRV across the entire listen segment.
 *                   Same scale conventions as hrv_before: `rmssd`, `lf`, `hf` in E[ln(x)].
 *                 properties:
 *                   hr:    { type: number, description: Mean heart rate (bpm). }
 *                   rmssd: { type: number, description: 'E[ln(rmssd)].' }
 *                   sdnn:  { type: number, description: SDNN (ms). }
 *                   pnn50: { type: number, description: 'pNN50 (%).' }
 *                   lf:    { type: number, description: 'E[ln(LF)].' }
 *                   hf:    { type: number, description: 'E[ln(HF)].' }
 *               goal_hrv:
 *                 type: object
 *                 description: |
 *                   Target HRV state from the /recommend request.
 *                   Same scale conventions: `rmssd`, `lf`, `hf` in E[ln(x)].
 *                 properties:
 *                   hr:    { type: number, description: Target heart rate (bpm). }
 *                   rmssd: { type: number, description: 'E[ln(rmssd)].' }
 *                   sdnn:  { type: number, description: Target SDNN (ms). }
 *                   pnn50: { type: number, description: 'Target pNN50 (%).' }
 *                   lf:    { type: number, description: 'E[ln(LF)].' }
 *                   hf:    { type: number, description: 'E[ln(HF)].' }
 *               mental_status:
 *                 type: object
 *                 description: Optional self-reported mental state labels.
 *                 properties:
 *                   before: { type: string, description: Self-reported state before listening (free text). }
 *                   after:  { type: string, description: Self-reported state after listening (free text). }
 *               reclog_id:
 *                 type: integer
 *                 description: Recommendation session log ID from /recommend. Links this feedback to the session that produced the recommendation.
 *               baseline_id:
 *                 type: integer
 *                 description: ID of the HRV baseline record (from /user/baseline) active during this session. Used for z-score normalisation in model features.
 *     responses:
 *       200:
 *         description: Feedback recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 feedback_id: { type: integer }
 *       202:
 *         description: Accepted – track not in database; will be imported from Jamendo before feedback is recorded.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:  { type: string, example: queued }
 *                 message: { type: string }
 *       400:
 *         description: Invalid parameters
 *       404:
 *         description: Track not found and no jamendo_id provided
 *       500:
 *         description: Server error
 */

interface Prop {
    user_id: string;
    track_id?: string;       // internal UUID; optional when jamendo_id is provided
    jamendo_id?: number;     // Jamendo track ID for tracks not yet in the database
    session_id: string;      // client-generated session UUID
    index_in_session: number; // 0-based position within the session
    gap_sec: number;         // seconds since previous track ended (0 for first track)
    daytime_section: string;
    listen_segment: { start_sec: number; end_sec: number };
    hrv_before: {
        hr: number; rmssd: number; sdnn: number; pnn50: number; lf: number; hf: number;
    };
    hrv_during: {
        hr: number; rmssd: number; sdnn: number; pnn50: number; lf: number; hf: number;
    };
    goal_hrv: {
        hr: number; rmssd: number; sdnn: number; pnn50: number; lf: number; hf: number;
    };
    mental_status?: { before?: string; after?: string };
    reclog_id?: number;
    baseline_id?: number;
}

type FeedbackHRV = { hr: number; rmssd: number; sdnn: number; pnn50: number; lf: number; hf: number };

async function insert_feedback(
    track_id: string,
    user_id: string,
    session_id: string,
    index_in_session: number,
    gap_sec: number,
    daytime_section: string,
    listen_segment: { start_sec: number; end_sec: number },
    hrv_before: FeedbackHRV,
    hrv_during: FeedbackHRV,
    goal_hrv: FeedbackHRV,
    mental_status: { before?: string; after?: string } | undefined,
    reclog_id: number | null,
    baseline_id: number | null,
): Promise<{ feedback_id: number | null; error?: string }> {
    // rmssd / lf / hf columns are E[ln(x)]; frontend sends the log-scale values directly.
    const [feedback, hist] = await Promise.all([
        DATABASE.Recommend.insert_physical_feedback({
            user_id, track_id, session_id, index_in_session, gap_sec,
            daytime_section: daytime_section as any,
            listen_start_sec: listen_segment.start_sec,
            listen_end_sec: listen_segment.end_sec,
            u_hr_literal: hrv_before.hr,
            u_rmssd_ln: hrv_before.rmssd,
            u_sdnn_literal: hrv_before.sdnn,
            u_pnn50_literal: hrv_before.pnn50,
            u_lf_ln: hrv_before.lf,
            u_hf_ln: hrv_before.hf,
            r_hr_literal: hrv_during.hr,
            r_rmssd_ln: hrv_during.rmssd,
            r_sdnn_literal: hrv_during.sdnn,
            r_pnn50_literal: hrv_during.pnn50,
            r_lf_ln: hrv_during.lf,
            r_hf_ln: hrv_during.hf,
            t_hr_literal: goal_hrv.hr,
            t_rmssd_ln: goal_hrv.rmssd,
            t_sdnn_literal: goal_hrv.sdnn,
            t_pnn50_literal: goal_hrv.pnn50,
            t_lf_ln: goal_hrv.lf,
            t_hf_ln: goal_hrv.hf,
            reclog_id, baseline_id,
            u_mental_status: mental_status?.before ?? null,
            r_mental_status: mental_status?.after ?? null,
            t_mental_status: null,
        }),
        DATABASE.History.insert(user_id, track_id),
    ]);

    if (feedback.error) return { feedback_id: null, error: 'Failed to save feedback' };
    if (hist.error) return { feedback_id: null, error: 'Failed to save listen history' };

    // Auto-trigger retrain (fire-and-forget)
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

    return { feedback_id: feedback.data ?? null };
}

router.post('/', async (req, res) => {
    const {
        user_id, track_id, jamendo_id,
        session_id, index_in_session, gap_sec,
        daytime_section, listen_segment, hrv_before, hrv_during, goal_hrv,
        mental_status, reclog_id = null, baseline_id = null,
    } = req.body as Prop;

    // ── Validation ────────────────────────────────────────────────────────────
    if (typeof user_id !== 'string') {
        res.status(400).json({ error: 'user_id must be a string' });
        return;
    }
    if (!track_id && typeof jamendo_id !== 'number') {
        res.status(400).json({ error: 'track_id or jamendo_id must be provided' });
        return;
    }
    if (track_id !== undefined && typeof track_id !== 'string') {
        res.status(400).json({ error: 'track_id must be a string' });
        return;
    }
    if (jamendo_id !== undefined && (!Number.isInteger(jamendo_id) || jamendo_id <= 0)) {
        res.status(400).json({ error: 'jamendo_id must be a positive integer' });
        return;
    }
    if (typeof session_id !== 'string' || session_id.length === 0) {
        res.status(400).json({ error: 'session_id must be a non-empty string' });
        return;
    }
    if (!Number.isInteger(index_in_session) || index_in_session < 0) {
        res.status(400).json({ error: 'index_in_session must be a non-negative integer' });
        return;
    }
    if (typeof gap_sec !== 'number' || gap_sec < 0) {
        res.status(400).json({ error: 'gap_sec must be a non-negative number' });
        return;
    }
    if (typeof daytime_section !== 'string' || !VALID_DAYTIME_SECTIONS.includes(daytime_section as any)) {
        res.status(400).json({ error: `daytime_section must be one of: ${VALID_DAYTIME_SECTIONS.join(', ')}` });
        return;
    }
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
    const hrv_before_err = validate_hrv(hrv_before, 'hrv_before');
    if (hrv_before_err) { res.status(400).json({ error: hrv_before_err }); return; }
    const hrv_during_err = validate_hrv(hrv_during, 'hrv_during');
    if (hrv_during_err) { res.status(400).json({ error: hrv_during_err }); return; }
    const goal_hrv_err = validate_hrv(goal_hrv, 'goal_hrv');
    if (goal_hrv_err) { res.status(400).json({ error: goal_hrv_err }); return; }
    if (baseline_id !== null && typeof baseline_id !== 'number') {
        res.status(400).json({ error: 'baseline_id must be a number' });
        return;
    }
    if (reclog_id !== null && typeof reclog_id !== 'number') {
        res.status(400).json({ error: 'reclog_id must be a number' });
        return;
    }

    // ── Resolve track ─────────────────────────────────────────────────────────
    let resolved_track_id: string | undefined;
    if (typeof track_id === 'string') {
        const track = await db
            .selectFrom('track')
            .where('id', '=', track_id)
            .select(['id', 'hidden'])
            .executeTakeFirst()
            .catch(() => undefined);
        if (track && !track.hidden) resolved_track_id = track.id;
    }

    // ── Background import path (track not in DB) ──────────────────────────────
    if (!resolved_track_id) {
        if (typeof jamendo_id !== 'number') {
            res.status(404).json({ error: 'Track not found in database; provide jamendo_id to import it.' });
            return;
        }

        res.status(202).json({ status: 'queued', message: 'Track not in database; importing from Jamendo before recording feedback.' });

        (async () => {
            const outcome = await download_and_import_jamendo(jamendo_id);
            if (outcome.status === 'failed') {
                console.warn(`[feedback/bg] Import failed for jamendo_id=${jamendo_id}: ${outcome.reason}`);
                return;
            }
            if (outcome.status === 'hidden') {
                console.warn(`[feedback/bg] Track jamendo_id=${jamendo_id} is hidden (${outcome.reason}); feedback dropped.`);
                return;
            }
            const imported_track_id = (outcome as { track_id?: string }).track_id;
            if (!imported_track_id) {
                console.warn(`[feedback/bg] No track_id resolved for jamendo_id=${jamendo_id}; feedback dropped.`);
                return;
            }
            const result = await insert_feedback(
                imported_track_id, user_id,
                session_id, index_in_session, gap_sec,
                daytime_section, listen_segment,
                hrv_before, hrv_during, goal_hrv,
                mental_status, reclog_id, baseline_id,
            );
            if (result.error) {
                console.error(`[feedback/bg] ${result.error} for jamendo_id=${jamendo_id}`);
            }
        })().catch(err => console.error('[feedback/bg] Unhandled error:', err));

        return;
    }

    // ── Normal (synchronous) path ─────────────────────────────────────────────
    const result = await insert_feedback(
        resolved_track_id, user_id,
        session_id, index_in_session, gap_sec,
        daytime_section, listen_segment,
        hrv_before, hrv_during, goal_hrv,
        mental_status, reclog_id, baseline_id,
    );

    if (result.error) {
        res.status(500).json({ error: result.error });
        return;
    }

    res.json({ feedback_id: result.feedback_id });
});

export default router;