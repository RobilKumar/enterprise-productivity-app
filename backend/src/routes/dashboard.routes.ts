import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { getDashboard } from '../controllers/kpi.controller';
const router = Router();
router.use(authenticate);
router.get('/', getDashboard);
export default router;
