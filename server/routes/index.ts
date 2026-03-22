import { Router } from 'express';
import { telegramController } from '../controllers/telegram';

const router = Router();

// Basic health check route
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'AI Chief of Staff'
  });
});

// Secure Telegram Webhook Endpoint
// In production, you would validate a secret token header here
router.post('/webhook/telegram', telegramController.handleWebhook);

export default router;
