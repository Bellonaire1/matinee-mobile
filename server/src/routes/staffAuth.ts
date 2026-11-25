import { Router } from 'express';
import { loginStaff } from '../controllers/staffAuthController.js';

const router = Router();

router.post('/login', loginStaff);

export default router;
