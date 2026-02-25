import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Conversation } from '../entities/Conversation';
import { Message } from '../entities/Message';
import { User } from '../entities/User';
import { In } from 'typeorm';

export class ConversationController {
  private conversationRepository = AppDataSource.getRepository(Conversation);
  private messageRepository = AppDataSource.getRepository(Message);
  private userRepository = AppDataSource.getRepository(User);

  private sanitizeMessage(message: any): any {
    if (!message) return message;
    // Remove backup fields from API responses
    const { originalContent, editHistory, ...sanitized } = message;
    return sanitized;
  }

  getConversations = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).userId;

      // Find all conversations for the user
      const conversations = await this.conversationRepository.find({
        where: [
          { user1Id: userId },
          { user2Id: userId },
        ],
        order: {
          updatedAt: 'DESC',
        },
      });

      // Get participant IDs
      const participantIds = conversations.map(conv =>
        conv.user1Id === userId ? conv.user2Id : conv.user1Id
      );

      // Fetch all participants
      const participants = await this.userRepository.find({
        where: { id: In(participantIds) },
        select: ['id', 'username', 'email', 'avatarUrl', 'status', 'lastSeen'],
      });

      // Fetch last message for each conversation with proper user validation
      const conversationIds = conversations.map(conv => conv.id);
      
      // Build a more robust query that ensures messages belong to the user
      const lastMessages = await this.messageRepository
        .createQueryBuilder('message')
        .where('message.conversationId IN (:...ids)', { ids: conversationIds })
        .andWhere('(message.senderId = :userId OR message.receiverId = :userId)', { userId })
        .andWhere('message.id IN (SELECT MAX(id) FROM messages WHERE "conversationId" IN (:...ids) AND ("senderId" = :userId OR "receiverId" = :userId) GROUP BY "conversationId")', { ids: conversationIds, userId })
        .getMany();

      // Count unread messages
      const unreadCounts = await this.messageRepository
        .createQueryBuilder('message')
        .select('message.conversationId', 'conversationId')
        .addSelect('COUNT(*)', 'count')
        .where('message.conversationId IN (:...ids)', { ids: conversationIds })
        .andWhere('message.receiverId = :userId', { userId })
        .andWhere('message.isRead = :isRead', { isRead: false })
        .groupBy('message.conversationId')
        .getRawMany();

      // Format response with validation
      const response = conversations
        .map(conv => {
          const participantId = conv.user1Id === userId ? conv.user2Id : conv.user1Id;
          const participant = participants.find(p => p.id === participantId);
          const lastMessage = lastMessages.find(m => m.conversationId === conv.id);
          const unreadCount = unreadCounts.find(u => u.conversationId === conv.id)?.count || 0;

          // Additional validation: ensure the last message (if exists) belongs to this conversation's participants
          if (lastMessage) {
            const messageInvolvesUser = 
              (lastMessage.senderId === userId || lastMessage.receiverId === userId) &&
              (lastMessage.senderId === participantId || lastMessage.receiverId === participantId);
            
            if (!messageInvolvesUser) {
              console.warn(`Invalid message detected in conversation ${conv.id}. Message does not belong to participants.`);
              return null; // Filter this out
            }
          }

          return {
            id: conv.id,
            participant,
            lastMessage: this.sanitizeMessage(lastMessage),
            unreadCount: parseInt(unreadCount),
            updatedAt: conv.updatedAt,
          };
        })
        .filter(conv => conv !== null && conv.participant !== undefined); // Remove invalid conversations

      res.json(response);
    } catch (error) {
      console.error('Get conversations error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  createConversation = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).userId;
      const { participantId } = req.body;

      if (!participantId) {
        res.status(400).json({ message: 'Participant ID is required' });
        return;
      }

      // Check if participant exists
      const participant = await this.userRepository.findOne({
        where: { id: participantId },
        select: ['id', 'username', 'email', 'avatarUrl', 'status', 'lastSeen'],
      });

      if (!participant) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      // Check if conversation already exists
      let conversation = await this.conversationRepository.findOne({
        where: [
          { user1Id: userId, user2Id: participantId },
          { user1Id: participantId, user2Id: userId },
        ],
      });

      // Create new conversation if it doesn't exist
      if (!conversation) {
        conversation = this.conversationRepository.create({
          user1Id: userId,
          user2Id: participantId,
        });
        await this.conversationRepository.save(conversation);
      }

      res.json({
        id: conversation.id,
        participant,
        lastMessage: null,
        unreadCount: 0,
        updatedAt: conversation.updatedAt,
      });
    } catch (error) {
      console.error('Create conversation error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}

