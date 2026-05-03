import { Router } from 'express';
import { DATABASE } from '../../../core/Database';
import { trigger_train } from '../../../core/ml';

const router = Router();

/**
 * @swagger
 * /user/model/train:
 *   post:
 *     summary: Manually trigger a model retrain for a user
 *     tags: [Model]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id]
 *             properties:
 *               user_id: { type: string }
 *     responses:
 *       200:
 *         description: Training complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 model_id: { type: integer }
 *       400:
 *         description: Invalid parameters or not enough training data
 *       500:
 *         description: Server error
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
 *     tags: [Model]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Model list
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
 *                       id:        { type: integer }
 *                       active:    { type: boolean }
 *                       timestamp: { type: string, format: date-time }
 *       400:
 *         description: Missing user_id
 *       500:
 *         description: Server error
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
 *     summary: Set a specific model version as active for a user
 *     tags: [Model]
 *     parameters:
 *       - in: path
 *         name: model_id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id]
 *             properties:
 *               user_id: { type: string }
 *     responses:
 *       200:
 *         description: Model activated
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Server error
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
