import { Router } from 'express';
import { DATABASE } from '../../core/Database';

const router = Router();

/**
 * @swagger
 * /songs:
 *   get:
 *     summary: List non-hidden tracks with audio features
 *     tags: [Songs]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Track list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tracks:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TrackWithFeatures'
 *       500:
 *         description: Server error
 */
router.get('/', async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const result = await DATABASE.Tracks.list_with_features(limit, offset);
    if (result.error) {
        res.status(500).json({ error: 'Failed to fetch tracks' });
        return;
    }
    res.json({ tracks: result.data });
});

/**
 * @swagger
 * /songs/{id}:
 *   get:
 *     summary: Get a single track by ID
 *     tags: [Songs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Track info
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Track'
 *       404:
 *         description: Track not found
 *       500:
 *         description: Server error
 */
router.get('/:id', async (req, res) => {
    const result = await DATABASE.Tracks.find_by_id(req.params.id);
    if (result.error) {
        res.status(500).json({ error: 'Failed to fetch track' });
        return;
    }
    if (!result.data) {
        res.status(404).json({ error: 'Track not found' });
        return;
    }
    res.json(result.data);
});

export default router;
