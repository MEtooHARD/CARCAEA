import express from 'express';
import songs from './songs/index';
import query from './query';
import { mid_logger } from '../util/middleware';

const router = express.Router();

router.use(
    '/songs',
    mid_logger('/songs'),
    songs
);

router.use(
    '/query',
    mid_logger('/query'),
    query
);

export default router;
