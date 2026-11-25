import { Router } from 'express';
import { checkInTicket, verifyTicket } from '../controllers/ticketController.js';
import { requireStaffAuth } from '../middleware/staffAuth.js';

const router = Router();

// The auth middleware is applied to every scanner operation, including read-only verification.
router.use(requireStaffAuth);
router.post('/verify', verifyTicket);
router.post('/check-in', checkInTicket);

export default router;
