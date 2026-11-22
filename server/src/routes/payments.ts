import { Router } from 'express';
import {
  initializePayment,
  handleWebhook,
  getPaymentStatus,
} from '../controllers/paymentController.js';

const router = Router();

// Initialize test payment checkout session
router.post('/initialize', initializePayment);

// Webhook ingestion endpoint for provider events
router.post('/webhook', handleWebhook);

// Read-only payment status inquiry
router.get('/status/:reference', getPaymentStatus);

export default router;
