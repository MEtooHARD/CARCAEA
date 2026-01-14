import { Router, type Request, type Response } from 'express';
import { song_by_va } from '../../../services/queries/valence_arousal';
import { mid_logger } from '../../../util/middleware';

const router = Router();

router.get(
    '/by_va',
    mid_logger('/by_va'),
    search
);

const V_MIN = 1, V_MAX = 9;
const A_MIN = 1, A_MAX = 9;
const TOL_MIN = 0, TOL_MAX = 5;

export async function search(req: Request, res: Response) {
    try {
        const start = Date.now();

        const { valence, arousal, tolerance = 0.5 } = req.query;

        console.log('validate params');

        if (typeof valence !== 'string' || typeof arousal !== 'string')
            return res.status(400)
                .json({ error: 'one or both the valence and arousal parameters are missing' });

        const v = parseFloat(valence as string);
        if (isNaN(v) || v < V_MIN || v > V_MAX) {
            return res.status(400)
                .json({ error: `Valence must be a number between ${V_MIN} and ${V_MAX}` });
        }

        const a = parseFloat(arousal as string);
        if (isNaN(a) || a < A_MIN || a > A_MAX) {
            return res.status(400)
                .json({ error: `Arousal must be a number between ${A_MIN} and ${A_MAX}` });
        }

        const t = parseFloat(tolerance as string);
        if (isNaN(t) || t < TOL_MIN || t > TOL_MAX) {
            return res.status(400)
                .json({ error: `Tolerance must be a number between ${TOL_MIN} and ${TOL_MAX}` });
        }

        console.log('query for songs');
        const qt_start = Date.now();
        const [songs, q_error] = await song_by_va.emomusic_msd(v, a, t);
        console.log('query took', Date.now() - qt_start, 'ms');

        console.log('total search took', Date.now() - start, 'ms');
        if (songs) return res.json({ songs });

        if (q_error) {
            console.error(q_error);
            return res.status(500)
                .json({ error: 'Couldn\'t find such songs' });
        }
    } catch (error) {
        console.error(error);
        res.status(500)
            .json({ error: 'Failed to search songs' });
    }
}

export default router;