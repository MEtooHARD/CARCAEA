import { Router } from 'express';
// import search from './search/index';
import { mid_logger } from '../../util/middleware';
// import upload from './upload/index';

const router = Router();

router.post('/recommend', mid_logger('/recommend'), async (req, res) => {

});

export default router;
