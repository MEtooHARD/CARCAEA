import { Router } from 'express';
import { DATABASE } from '../../../core/Database';
import { trigger_train } from '../../../core/ml';

const router = Router();

/**
 * @swagger
 * /user/model/train:
 *   post:
 *     summary: Manually trigger a model retrain for a user
 *     description: |
 *       Collects all feedback records for the user, builds a 28-feature training matrix,
 *       sends it to the ML server, and saves the resulting six XGBoost models (one per HRV metric:
 *       hr, rmssd, sdnn, pnn50, lf, hf) as a new active model version.
 *       The previous active model is deactivated.
 *       Models are also retrained automatically every 100 feedback submissions.
 *     tags: [Model]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id]
 *             properties:
 *               user_id:
 *                 type: string
 *                 description: UUID of the user whose model should be retrained.
 *     responses:
 *       200:
 *         description: Training completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 model_id:
 *                   type: integer
 *                   description: ID of the newly trained and activated model.
 *       400:
 *         description: Invalid user_id or insufficient training data (fewer records than required).
 *       500:
 *         description: ML server or database error.
 */
router.post('/train', async (req, res) => {
    const { user_id } = req.body;
    if (typeof user_id !== 'string') {
        res.status(400).json({ error: 'user_id must be a string' });
        return;
    }

    const result = await trigger_train(user_id);
    if (result.error) {
        const msg = result.error.message ?? String(result.error);
        const status = msg.includes('No training cases') ? 400 : 500;
        res.status(status).json({ error: msg });
        return;
    }

    res.json({ model_id: result.data });
});

/**
 * @swagger
 * /user/model:
 *   get:
 *     summary: List all model versions for a user
 *     description: |
 *       Returns the training history for a user's personal model. Model blobs (the actual
 *       XGBoost weights) are stripped from the response for size reasons; only metadata is returned.
 *       The currently active model has `active: true` and is used by /recommend.
 *     tags: [Model]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema: { type: string }
 *         description: UUID of the user.
 *     responses:
 *       200:
 *         description: List of model versions (newest first).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 models:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:        { type: integer,            description: Model version ID. }
 *                       active:    { type: boolean,            description: Whether this version is currently used for recommendations. }
 *                       timestamp: { type: string, format: date-time, description: When this model version was trained. }
 *       400:
 *         description: user_id query parameter missing.
 *       500:
 *         description: Database error.
 */
router.get('/', async (req, res) => {
    const { user_id } = req.query;
    if (typeof user_id !== 'string') {
        res.status(400).json({ error: 'user_id query param required' });
        return;
    }

    const result = await DATABASE.Models.list(user_id);
    if (result.error) {
        res.status(500).json({ error: 'Failed to fetch models' });
        return;
    }

    // Strip model blobs from list response — they are large
    const models = (result.data ?? []).map(({ model_hr, model_rmssd, model_sdnn, model_pnn50, model_lf, model_hf, ...rest }) => rest);
    res.json({ models });
});

/**
 * @swagger
 * /user/model/{model_id}/activate:
 *   put:
 *     summary: Activate a specific model version for a user
 *     description: |
 *       Sets the specified model version as the active one for the user.
 *       All other versions for this user are deactivated.
 *       After this call, /recommend will use the newly activated model.
 *       Useful for rolling back to an earlier model if the latest one performs poorly.
 *     tags: [Model]
 *     parameters:
 *       - in: path
 *         name: model_id
 *         required: true
 *         schema: { type: integer }
 *         description: ID of the model version to activate (from /user/model GET).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id]
 *             properties:
 *               user_id:
 *                 type: string
 *                 description: UUID of the user who owns the model. Must match the model's user_id.
 *     responses:
 *       200:
 *         description: Model activated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *       400:
 *         description: model_id not a positive integer, or user_id missing.
 *       500:
 *         description: Database error.
 */
router.put('/:model_id/activate', async (req, res) => {
    const model_id = Number(req.params.model_id);
    const { user_id } = req.body;

    if (!Number.isInteger(model_id) || model_id <= 0) {
        res.status(400).json({ error: 'model_id must be a positive integer' });
        return;
    }
    if (typeof user_id !== 'string') {
        res.status(400).json({ error: 'user_id must be a string' });
        return;
    }

    const result = await DATABASE.Models.activate(model_id, user_id);
    if (result.error) {
        res.status(500).json({ error: 'Failed to activate model' });
        return;
    }
    res.json({ ok: true });
});

export default router;
