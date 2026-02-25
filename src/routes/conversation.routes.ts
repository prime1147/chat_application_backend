import { Router } from 'express';
import { body } from 'express-validator';
import { ConversationController } from '../controllers/conversation.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';

const router = Router();
const conversationController = new ConversationController();

router.get('/', authMiddleware, conversationController.getConversations);

router.post(
  '/',
  [
    authMiddleware,
    body('participantId').isInt().withMessage('Invalid participant ID'),
    validate,
  ],
  conversationController.createConversation
);

export default router;

