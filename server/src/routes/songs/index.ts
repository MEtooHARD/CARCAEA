import { Router } from 'express';
import { DATABASE, db } from '../../core/Database';

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
 *     summary: Get a single track by ID with optional features and envelopes
 *     tags: [Songs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: features
 *         schema: { type: boolean, default: false }
 *         description: Include track_audio_features data
 *       - in: query
 *         name: envelopes
 *         schema: { type: boolean, default: false }
 *         description: Include track_feat_envelopes data
 *     responses:
 *       200:
 *         description: Track info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 track:
 *                   $ref: '#/components/schemas/Track'
 *                 features:
 *                   $ref: '#/components/schemas/TrackAudioFeatures'
 *                 envelopes:
 *                   $ref: '#/components/schemas/TrackFeatEnvelopes'
 *       404:
 *         description: Track not found
 *       500:
 *         description: Server error
 */
router.get('/:id', async (req, res) => {
    const { features = false, envelopes = false } = req.query;
    const include_features = features === 'true' || Boolean(features) === true;
    const include_envelopes = envelopes === 'true' || Boolean(envelopes) === true;

    const track_result = await DATABASE.Tracks.find_by_id(req.params.id);
    if (track_result.error) {
        res.status(500).json({ error: 'Failed to fetch track' });
        return;
    }
    if (!track_result.data) {
        res.status(404).json({ error: 'Track not found' });
        return;
    }

    const response: any = { track: track_result.data };

    if (include_features) {
        try {
            const features_data = await db
                .selectFrom('track_audio_features')
                .where('track_id', '=', req.params.id)
                .selectAll()
                .executeTakeFirst();
            if (features_data) response.features = features_data;
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch features' });
            return;
        }
    }

    if (include_envelopes) {
        const envelopes_result = await DATABASE.Tracks.get_envelopes(req.params.id);
        if (!envelopes_result.error && envelopes_result.data) {
            response.envelopes = envelopes_result.data;
        }
    }

    res.json(response);
});

export default router;
