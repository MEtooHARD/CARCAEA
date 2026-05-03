import { Router } from "express";
import { DATABASE } from '../../../core/Database';

const router = Router();

/**
 * @swagger
 * /recommend/abort:
 *   post:
 *     summary: Log a skipped/aborted recommendation
 *     tags: [Recommend]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, original_track_id]
 *             properties:
 *               user_id:            { type: string }
 *               original_track_id:  { type: string }
 *               alternate_track_id: { type: string }
 *               reclog_id:          { type: integer }
 *     responses:
 *       200:
 *         description: Abort logged
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Server error
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