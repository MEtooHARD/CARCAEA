import express from 'express';
import { mid_logger } from '../util/middleware';
import feedback from './feedback';
import recommend from './recommend';
import songs from './songs';
import user from './user';

const router = express.Router();

router.use('/recommend', mid_logger('/recommend'), recommend);
router.use('/feedback',  mid_logger('/feedback'),  feedback);
router.use('/songs',     mid_logger('/songs'),     songs);
router.use('/user',      mid_logger('/user'),      user);

export default router;
