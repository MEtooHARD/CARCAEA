import { Router } from "express";
import { DATABASE } from '../../../core/Database';

const router = Router();

/**
 * @swagger
 * /recommend/abort:
 *   post:
 *     summary: Log that a recommended track was skipped or aborted
 *     description: |
 *       Called when the user skips a recommended track before finishing it.
 *       Records the skipped track and optionally the track the user switched to.
 *       Used to inform future recommendation quality analysis and avoid re-recommending
 *       tracks the user rejected.
 *     tags: [Recommend]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, original_track_id]
 *             properties:
 *               user_id:
 *                 type: string
 *                 description: Unique user identifier (UUID).
 *               original_track_id:
 *                 type: string
 *                 description: Internal UUID of the track that was skipped.
 *               alternate_track_id:
 *                 type: string
 *                 description: Internal UUID of the track the user switched to (optional).
 *               reclog_id:
 *                 type: integer
 *                 description: Recommendation session log ID returned by /recommend (optional but recommended for traceability).
 *     responses:
 *       200:
 *         description: Abort event logged successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *       400:
 *         description: Missing required fields (user_id or original_track_id).
 *       500:
 *         description: Database error.
 */
router.post('/', async (req, res) => {
    const {
        user_id, original_track_id,
        alternate_track_id = null,
        reclog_id = null,
    } = req.body;

    if (!user_id || !original_track_id) {
        res.status(400).json({ error: 'user_id and original_track_id are required' });
        return;
    }

    const result = await DATABASE.Recommend.log_abort(
        user_id, reclog_id, original_track_id, alternate_track_id
    );
    if (result.error) {
        res.status(500).json({ error: 'Failed to log abort' });
        return;
    }

    res.json({ ok: true });
});

export default router;