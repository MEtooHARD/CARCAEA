import { Router } from 'express';
import { DATABASE, db } from '../../core/Database';

const router = Router();

/**
 * @swagger
 * /songs:
 *   get:
 *     summary: List tracks with audio features
 *     description: |
 *       Returns a paginated list of non-hidden tracks joined with their extracted audio
 *       features. Useful for browsing the music library or building custom UIs.
 *       Results are not ordered by any recommendation score; use `/recommend` for that.
 *     tags: [Songs]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100, maximum: 500 }
 *         description: Number of tracks to return (max 500).
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *         description: Zero-based offset for pagination.
 *     responses:
 *       200:
 *         description: Paginated track list with audio features.
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
 *         description: Database error.
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
 *     description: |
 *       Fetches metadata for one track. Optionally includes the extracted audio feature
 *       scalars (`features`) and/or the full time-series envelopes (`envelopes`).
 *       Envelopes are large arrays (loudness, chroma matrix, tempo, pulse clarity at 4 Hz)
 *       and should only be requested when needed.
 *     tags: [Songs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Internal track UUID.
 *       - in: query
 *         name: features
 *         schema: { type: boolean, default: false }
 *         description: If true, include the track's extracted audio feature scalars (tempo, loudness, mode, etc.).
 *       - in: query
 *         name: envelopes
 *         schema: { type: boolean, default: false }
 *         description: If true, include the full time-series envelopes (loudness, chroma matrix, tempo, pulse clarity at 4 Hz). Large payload.
 *     responses:
 *       200:
 *         description: Track data (features and envelopes included only when requested).
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
 *         description: Track not found.
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
