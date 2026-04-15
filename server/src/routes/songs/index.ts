import { Router } from 'express';
// import search from './search/index';
import { mid_logger } from '../../util/middleware';
import upload from './upload/index';

const router = Router();

// 用 VA 值查歌
// GET /api/songs/search?valence=0.7&arousal=0.5&tolerance=0.1
// router.get('/search', search);
// router.use(
//     '/search',
//     mid_logger('/search'),
//     search
// );

router.use(
    '/upload',
    mid_logger('/upload'),
    upload
)

export default router;
