import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Message } from '../entities/Message';
import { Conversation } from '../entities/Conversation';

export class MessageController {
  private messageRepository = AppDataSource.getRepository(Message);
  private conversationRepository = AppDataSource.getRepository(Conversation);

  private sanitizeMessage(message: any): any {
    // Remove backup fields from API responses
    const { originalContent, editHistory, ...sanitized } = message;
    return sanitized;
  }

  private sanitizeMessages(messages: any[]): any[] {
    return messages.map(msg => this.sanitizeMessage(msg));
  }

  getMessages = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).userId;
      const { conversationId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      // Verify user is part of conversation
      const conversation = await this.conversationRepository.findOne({
        where: { id: parseInt(conversationId) },
      });

      if (!conversation) {
        res.status(404).json({ message: 'Conversation not found' });
        return;
      }

      if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }

      // Get messages with proper filtering to ensure user is part of the conversation
      const messages = await this.messageRepository
        .createQueryBuilder('message')
        .where('message.conversationId = :conversationId', { conversationId: parseInt(conversationId) })
        .andWhere('(message.senderId = :userId OR message.receiverId = :userId)', { userId })
        .orderBy('message.createdAt', 'DESC')
        .take(limit)
        .skip((page - 1) * limit)
        .getMany();

      // Sanitize messages before sending (remove backup fields)
      res.json(this.sanitizeMessages(messages));
    } catch (error) {
      console.error('Get messages error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  markAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).userId;
      const { messageId } = req.params;

      const message = await this.messageRepository.findOne({
        where: { id: parseInt(messageId) },
      });

      if (!message) {
        res.status(404).json({ message: 'Message not found' });
        return;
      }

      // Only receiver can mark as read
      if (message.receiverId !== userId) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }

      message.isRead = true;
      await this.messageRepository.save(message);

      res.json({ message: 'Message marked as read' });
    } catch (error) {
      console.error('Mark as read error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  updateMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).userId;
      const { messageId } = req.params;
      const { content } = req.body;

      if (!content || !content.trim()) {
        res.status(400).json({ message: 'Content is required' });
        return;
      }

      const message = await this.messageRepository.findOne({
        where: { id: parseInt(messageId) },
      });

      if (!message) {
        res.status(404).json({ message: 'Message not found' });
        return;
      }

      // Only sender can update their message
      if (message.senderId !== userId) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }

      // Cannot update deleted message
      if (message.isDeleted) {
        res.status(400).json({ message: 'Cannot update deleted message' });
        return;
      }

      // Save current content to edit history before updating
      const editHistory = message.editHistory || [];
      editHistory.push({
        content: message.content,
        editedAt: new Date(),
      });

      message.editHistory = editHistory;
      message.content = content.trim();
      message.isEdited = true;
      message.editedAt = new Date();
      await this.messageRepository.save(message);

      // Sanitize message before sending (remove backup fields)
      res.json(this.sanitizeMessage(message));
    } catch (error) {
      console.error('Update message error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  deleteMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).userId;
      const { messageId } = req.params;

      const message = await this.messageRepository.findOne({
        where: { id: parseInt(messageId) },
      });

      if (!message) {
        res.status(404).json({ message: 'Message not found' });
        return;
      }

      // Only sender can delete their message
      if (message.senderId !== userId) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }

      // Soft delete - original content is backed up in originalContent field
      message.isDeleted = true;
      message.deletedAt = new Date();
      message.content = 'This message was deleted'; // Safe to change since originalContent has backup
      await this.messageRepository.save(message);

      res.json({ message: 'Message deleted successfully' });
    } catch (error) {
      console.error('Delete message error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  getMessageHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).userId;
      const { messageId } = req.params;

      const message = await this.messageRepository.findOne({
        where: { id: parseInt(messageId) },
      });

      if (!message) {
        res.status(404).json({ message: 'Message not found' });
        return;
      }

      // Both sender and receiver can view history
      if (message.senderId !== userId && message.receiverId !== userId) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }

      const history = {
        originalContent: message.originalContent,
        currentContent: message.content,
        editHistory: message.editHistory || [],
        isDeleted: message.isDeleted,
        deletedAt: message.deletedAt,
        isEdited: message.isEdited,
        editedAt: message.editedAt,
      };

      res.json(history);
    } catch (error) {
      console.error('Get message history error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}

