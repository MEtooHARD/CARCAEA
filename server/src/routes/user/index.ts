import { Router } from "express";
import { randomUUID } from "node:crypto";
import { DATABASE, db } from "../../core/Database";
import { validate_hrv } from "../recommend";
import type { HRVBaseline } from "../../types/metrix";
import { try_catch } from "../../types/Result";
import model_router from "./model";

const router = Router();

router.use('/model', model_router);

/**
 * @swagger
 * /user:
 *   post:
 *     summary: Create a new user
 *     description: Registers a new user and returns the generated UUID. The name does not need to be unique.
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Display name for the user.
 *     responses:
 *       200:
 *         description: User created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:   { type: string, description: Generated UUID for the new user. }
 *                 name: { type: string, description: The name provided in the request. }
 *       400:
 *         description: name field missing or not a string.
 *       500:
 *         description: Database error.
 *   put:
 *     summary: Update a user's display name
 *     description: Replaces the display name for an existing user.
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, name]
 *             properties:
 *               user_id: { type: string, description: UUID of the user to update. }
 *               name:    { type: string, description: New display name. }
 *     responses:
 *       200:
 *         description: Name updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:   { type: string, description: UUID of the updated user. }
 *                 name: { type: string, description: The new name. }
 *       400:
 *         description: user_id or name missing / not a string.
 *       500:
 *         description: Database error.
 */

router.post('/', async (req, res) => {
    const { name } = req.body;
    if (typeof name !== 'string')
        return res.status(400).json({ error: 'name must be a string' });

    const uid = randomUUID();
    const insert_res = await DATABASE.Users.insert(uid, name);

    if (insert_res.error)
        return res.status(500).json({ error: 'Error when creating the user' });

    return res.status(200).json({ id: uid, name });
});

router.put('/', async (req, res) => {
    const { user_id, name } = req.body;
    if (typeof user_id !== 'string' || typeof name !== 'string')
        return res.status(400).json({ error: 'user_id and name must be strings' });

    const update_res = await DATABASE.Users.update(user_id, name);
    if (update_res.error)
        return res.status(500).json({ error: 'Error when updating the user' });

    return res.status(200).json({ id: user_id, name });
});

/**
 * @swagger
 * /user:
 *   get:
 *     summary: Look up a user by ID or search by name
 *     description: |
 *       Two lookup modes depending on which query parameter is supplied:
 *       - `user_id` (exact match) — returns a single `user` object or 404.
 *       - `name` (case-insensitive substring search) — returns a `users` array (may be empty).
 *       Providing both parameters uses `user_id` and ignores `name`.
 *     tags: [User]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema: { type: string }
 *         description: Exact UUID lookup. Returns 404 when not found.
 *       - in: query
 *         name: name
 *         schema: { type: string }
 *         description: Case-insensitive substring search on display name. Returns an array.
 *     responses:
 *       200:
 *         description: Matched user or users.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/User' }
 *                 - type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/User' }
 *       404:
 *         description: No user found for the given user_id.
 *       500:
 *         description: Database error.
 */
router.get('/', async (req, res) => {
    const { user_id, name } = req.query;

    if (typeof user_id === 'string' && user_id) {
        const user = await DATABASE.Users.find(user_id);
        if (user.error)
            return res.status(500).json({ error: 'Error when fetching the user' });
        if (!user.data)
            return res.status(404).json({ error: 'User not found' });
        return res.json({ user: user.data });
    }

    if (typeof name === 'string' && name) {
        const users = await try_catch(db.selectFrom('users')
            .where('name', 'ilike', `%${name}%`)
            .execute());

        if (users.error)
            return res.status(500).json({ error: 'Error when searching users' });
        return res.json({ users: users.data });
    }
});

interface BaselineProp {
    user_id: string;
    baseline: HRVBaseline;
    daytime_section: number;
}

/**
 * @swagger
 * /user/baseline:
 *   post:
 *     summary: Submit a user's resting HRV baseline for a daytime section
 *     description: |
 *       Records the user's resting HRV statistics for a specific daytime section.
 *       These values serve as the personalised normalisation reference for z-score
 *       conversion when building training features for the personal XGBoost model.
 *
 *       **Required fields** — `baseline.literal` and `baseline.std`
 *       These are computed from raw HRV readings in the baseline session:
 *       - `literal`: sample mean of each raw HRV metric
 *       - `std`: sample standard deviation of each raw HRV metric
 *
 *       **Optional fields** — `baseline.ln_mean` and `baseline.ln_std` (rmssd / lf / hf only)
 *       rmssd, lf, and hf are log-normally distributed. Computing z-scores directly on the
 *       raw scale is statistically incorrect because:
 *       - The distribution is right-skewed, so mean ± std does not represent the central 68 % range
 *       - Jensen's inequality means E[ln(x)] ≠ ln(E[x]), so the ln-scale mean cannot be
 *         back-calculated from the raw mean
 *
 *       To enable correct ln-z-score normalisation, the client must compute and supply:
 *       - `ln_mean.rmssd` = mean of ln(rmssd) across baseline samples  (i.e. E[ln(rmssd)])
 *       - `ln_std.rmssd`  = std  of ln(rmssd) across baseline samples
 *       - same for lf and hf
 *
 *       When these are provided, the ranking pipeline can normalise as:
 *       `z = (ln(x) - ln_mean) / ln_std`
 *       instead of the less accurate `z = (x - literal) / std`.
 *
 *       hr, sdnn, and pnn50 are approximately normally distributed; they use `literal` / `std`
 *       directly and do not need ln-scale variants.
 *
 *       If `ln_mean` / `ln_std` are omitted, the system falls back to raw-scale z-score for all
 *       metrics (acceptable for early testing, less accurate for lf/hf/rmssd).
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, baseline, daytime_section]
 *             properties:
 *               user_id:
 *                 type: string
 *                 description: UUID of the user submitting the baseline.
 *               baseline:
 *                 $ref: '#/components/schemas/HRVBaseline'
 *                 description: Computed resting HRV statistics. See schema for required sub-fields.
 *               daytime_section:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 1439
 *                 description: Time of day the baseline was measured, as minutes since midnight (0 = 00:00, 1439 = 23:59). Baselines are stored per time-of-day to capture circadian variation.
 *     responses:
 *       200:
 *         description: Baseline recorded. Returns the generated baseline_id for use in /feedback.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *       400:
 *         description: Invalid or missing fields.
 *       500:
 *         description: Database error.
 */
router.post('/baseline', async (req, res) => {
    const { user_id, baseline, daytime_section } = req.body as BaselineProp;

    if (typeof user_id !== 'string') {
        res.status(400).json({ error: 'user_id must be a string' });
        return;
    }

    if (!Number.isInteger(daytime_section) || daytime_section < 0 || daytime_section > 1439)
        return res.status(400).json({ error: 'daytime_section must be an integer between 0 and 1439 (minutes since midnight)' });

    const hrv_err = validate_hrv(baseline.literal, 'baseline.literal');
    if (hrv_err) return res.status(400).json({ error: hrv_err });
    const hrv_err_std = validate_hrv(baseline.std, 'baseline.std');
    if (hrv_err_std) return res.status(400).json({ error: hrv_err_std });

    const insert_res = await DATABASE.Users.insert_baseline(user_id, {
        daytime_section,
        hr_literal: baseline.literal.hr,
        rmssd_literal: baseline.literal.rmssd,
        sdnn_literal: baseline.literal.sdnn,
        pnn50_literal: baseline.literal.pnn50,
        lf_literal: baseline.literal.lf,
        hf_literal: baseline.literal.hf,
        hr_std: baseline.std.hr,
        rmssd_std: baseline.std.rmssd,
        sdnn_std: baseline.std.sdnn,
        pnn50_std: baseline.std.pnn50,
        lf_std: baseline.std.lf,
        hf_std: baseline.std.hf,
        // ln-scale stats (optional — null when not provided)
        rmssd_ln_mean: baseline.ln_mean?.rmssd ?? null,
        rmssd_ln_std:  baseline.ln_std?.rmssd  ?? null,
        lf_ln_mean:    baseline.ln_mean?.lf    ?? null,
        lf_ln_std:     baseline.ln_std?.lf     ?? null,
        hf_ln_mean:    baseline.ln_mean?.hf    ?? null,
        hf_ln_std:     baseline.ln_std?.hf     ?? null,
    });

    if (insert_res.error) return res.status(500).json({ error: 'Error when adding baseline' });

    return res.json({ ok: true });
});

export default router;