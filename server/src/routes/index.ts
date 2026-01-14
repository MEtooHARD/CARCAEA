import express from 'express';
import songs from './songs/index';
import { mid_logger } from '../util/middleware';

const router = express.Router();

router.use(
    '/songs',
    mid_logger('/songs'),
    songs
);

export default router;
