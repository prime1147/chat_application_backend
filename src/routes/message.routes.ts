import { Router } from 'express';
import { MessageController } from '../controllers/message.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();
const messageController = new MessageController();

router.put('/:messageId/read', authMiddleware, messageController.markAsRead);
router.put('/:messageId', authMiddleware, messageController.updateMessage);
router.delete('/:messageId', authMiddleware, messageController.deleteMessage);
router.get('/:messageId/history', authMiddleware, messageController.getMessageHistory);

export default router;

