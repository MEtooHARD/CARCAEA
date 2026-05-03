import { Router } from "express";
import { randomUUID } from "node:crypto";
import { DATABASE, db } from "../../core/Database";
import { validate_hrv } from "../recommend";
import type { HRVBaseline } from "../../types/metrix";
import { try_catch } from "../../types/Result";

export const DAYTIME_OPTIONS = ["afternoon", "evening", "morning", "night"] as const;

const router = Router();

/**
 * @swagger
 * /user:
 *   post:
 *     summary: Create a new user
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *     responses:
 *       200:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Server error
 *   put:
 *     summary: Update user name
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, name]
 *             properties:
 *               user_id: { type: string }
 *               name:    { type: string }
 *     responses:
 *       200:
 *         description: User updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Server error
 */

router.post('/', async (req, res) => {
    const { name } = req.body;
    if (typeof name !== 'string')
        return res.status(400).json({ error: 'name must be a string' });


    const insert_res = await DATABASE.Users.insert(randomUUID(), name);

    if (insert_res.error)
        return res.status(500).json({ error: 'Error when creating the user' });

    return res.json({ ok: true });
});

router.put('/', async (req, res) => {
    const { user_id, name } = req.body;
    if (typeof user_id !== 'string' || typeof name !== 'string')
        return res.status(400).json({ error: 'user_id and name must be strings' });

    const update_res = await DATABASE.Users.update(user_id, name);
    if (update_res.error)
        return res.status(500).json({ error: 'Error when updating the user' });

    return res.json({ ok: true });
});

/** get matched user */
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
    daytime_section: typeof DAYTIME_OPTIONS[number];
}

/**
 * @swagger
 * /user/baseline:
 *   post:
 *     summary: Submit a user HRV baseline for a daytime section.
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
 *               baseline:
 *                 $ref: '#/components/schemas/HRVBaseline'
 *               daytime_section:
 *                 type: string
 *                 enum: [morning, afternoon, evening, night]
 *     responses:
 *       200:
 *         description: Baseline recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Server error
 */
router.post('/baseline', async (req, res) => {
    const { user_id, baseline, daytime_section } = req.body as BaselineProp;

    if (typeof user_id !== 'string') {
        res.status(400).json({ error: 'user_id must be a string' });
        return;
    }

    if (!DAYTIME_OPTIONS.includes(daytime_section as any))
        return res.status(400).json({ error: `daytime_section must be one of: ${DAYTIME_OPTIONS.join(', ')}` });

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
    });

    if (insert_res.error) return res.status(500).json({ error: 'Error when adding baseline' });

    return res.json({ ok: true });
});

export default router;