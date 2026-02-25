import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { Message } from '../entities/Message';
import { Conversation } from '../entities/Conversation';
import { User } from '../entities/User';

interface AuthSocket extends Socket {
  userId?: number;
}

export class SocketHandler {
  private io: Server;
  private messageRepository = AppDataSource.getRepository(Message);
  private conversationRepository = AppDataSource.getRepository(Conversation);
  private userRepository = AppDataSource.getRepository(User);
  private userSockets: Map<number, string> = new Map(); // userId -> socketId

  constructor(io: Server) {
    this.io = io;
    this.initializeSocketEvents();
  }

  private initializeSocketEvents(): void {
    this.io.use(this.authenticateSocket.bind(this));

    this.io.on('connection', (socket: AuthSocket) => {
      console.log(`User connected: ${socket.userId}, socket: ${socket.id}`);
      
      if (socket.userId) {
        // Join user's personal room (room name = "user_" + userId)
        const userRoom = `user_${socket.userId}`;
        socket.join(userRoom);
        console.log(`User ${socket.userId} joined room: ${userRoom}`);
        
        this.userSockets.set(socket.userId, socket.id);
        this.updateUserStatus(socket.userId, 'online');
        
        // Mark pending messages as delivered when user comes online
        this.markPendingMessagesAsDelivered(socket.userId, socket);
        
        // Broadcast user online status to all connected users
        this.io.emit('userStatusChange', { 
          userId: socket.userId, 
          status: 'online',
          lastSeen: new Date()
        });
      }

      socket.on('sendMessage', this.handleSendMessage.bind(this, socket));
      socket.on('markAsRead', this.handleMarkAsRead.bind(this, socket));
      socket.on('typing', this.handleTyping.bind(this, socket));
      socket.on('updateMessage', this.handleUpdateMessage.bind(this, socket));
      socket.on('deleteMessage', this.handleDeleteMessage.bind(this, socket));

      socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.userId}`);
        if (socket.userId) {
          // Leave user's personal room
          const userRoom = `user_${socket.userId}`;
          socket.leave(userRoom);
          
          this.userSockets.delete(socket.userId);
          const lastSeen = new Date();
          this.updateUserStatus(socket.userId, 'offline', lastSeen);
          
          // Broadcast user offline status to all connected users with last seen
          this.io.emit('userStatusChange', { 
            userId: socket.userId, 
            status: 'offline',
            lastSeen: lastSeen
          });
        }
      });
    });
  }

  private async authenticateSocket(socket: AuthSocket, next: (err?: Error) => void): Promise<void> {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error'));
      }

      const jwtSecret = process.env.JWT_SECRET || 'fallback-secret-key';
      const decoded = jwt.verify(token, jwtSecret) as { userId: number };
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  }

  private async handleSendMessage(socket: AuthSocket, data: { receiverId: number; content: string }): Promise<void> {
    try {
      const senderId = socket.userId!;
      const { receiverId, content } = data;

      // Validate that sender is not sending to themselves
      if (senderId === receiverId) {
        socket.emit('error', { message: 'Cannot send message to yourself' });
        return;
      }

      // Verify receiver exists
      const receiver = await this.userRepository.findOne({ where: { id: receiverId } });
      if (!receiver) {
        socket.emit('error', { message: 'Receiver not found' });
        return;
      }

      // Find or create conversation
      let conversation = await this.conversationRepository.findOne({
        where: [
          { user1Id: senderId, user2Id: receiverId },
          { user1Id: receiverId, user2Id: senderId },
        ],
      });

      if (!conversation) {
        conversation = this.conversationRepository.create({
          user1Id: senderId,
          user2Id: receiverId,
        });
        await this.conversationRepository.save(conversation);
      }

      // Verify conversation belongs to sender
      if (conversation.user1Id !== senderId && conversation.user2Id !== senderId) {
        socket.emit('error', { message: 'Invalid conversation access' });
        console.error(`Security alert: User ${senderId} attempted to send message in conversation ${conversation.id}`);
        return;
      }

      // Create message
      const message = this.messageRepository.create({
        content,
        originalContent: content, // Store original content for backup
        senderId,
        receiverId,
        conversationId: conversation.id,
        isDelivered: false,
        isRead: false,
        editHistory: [],
      });

      await this.messageRepository.save(message);

      // Update conversation timestamp
      conversation.updatedAt = new Date();
      await this.conversationRepository.save(conversation);

      // Sanitize message before sending (remove backup fields)
      const messageToSend = this.sanitizeMessage(message);

      // IMPORTANT: Only send to sender (current socket) - not broadcast
      socket.emit('newMessage', messageToSend);

      // Send to receiver's room ONLY - this ensures only the receiver gets it
      const receiverRoom = `user_${receiverId}`;
      const receiverSocketId = this.userSockets.get(receiverId);
      
      if (receiverSocketId) {
        // Receiver is online
        message.isDelivered = true;
        await this.messageRepository.save(message);
        
        // Send ONLY to receiver's room (not to sender's room or broadcast)
        this.io.to(receiverRoom).emit('newMessage', this.sanitizeMessage(message));
        console.log(`Message delivered to receiver room: ${receiverRoom}`);
        
        // Notify sender that message was delivered
        socket.emit('messageDelivered', {
          messageId: message.id,
          conversationId: conversation.id,
        });
      } else {
        console.log(`Receiver ${receiverId} is offline, message not delivered`);
      }

      console.log(`Message sent from ${senderId} to ${receiverId}, delivered: ${!!receiverSocketId}`);
    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  private async handleMarkAsRead(socket: AuthSocket, data: { messageId: number; conversationId?: number }): Promise<void> {
    try {
      const userId = socket.userId!;
      const { messageId, conversationId } = data;

      // If conversationId is provided, mark all messages in that conversation as read
      if (conversationId) {
        const messages = await this.messageRepository.find({
          where: {
            conversationId: conversationId,
            receiverId: userId,
            isRead: false,
          },
        });

        for (const message of messages) {
          message.isRead = true;
          message.isDelivered = true;
          await this.messageRepository.save(message);

          // Notify sender using their room
          const senderRoom = `user_${message.senderId}`;
          this.io.to(senderRoom).emit('messageRead', {
            messageId: message.id,
            conversationId: conversationId,
          });
        }
        
        console.log(`${messages.length} messages in conversation ${conversationId} marked as read by ${userId}`);
        return;
      }

      // Single message mark as read
      const message = await this.messageRepository.findOne({
        where: { id: messageId },
      });

      if (!message) {
        return;
      }

      // Only receiver can mark as read
      if (message.receiverId !== userId) {
        return;
      }

      message.isRead = true;
      message.isDelivered = true;
      await this.messageRepository.save(message);

      // Notify sender using their room
      const senderRoom = `user_${message.senderId}`;
      this.io.to(senderRoom).emit('messageRead', {
        messageId: message.id,
        conversationId: message.conversationId,
      });

      console.log(`Message ${messageId} marked as read by ${userId}`);
    } catch (error) {
      console.error('Mark as read error:', error);
    }
  }

  private async handleTyping(socket: AuthSocket, data: { conversationId: number }): Promise<void> {
    try {
      const userId = socket.userId!;
      const { conversationId } = data;

      // Find the conversation to get the other participant
      const conversation = await this.conversationRepository.findOne({
        where: { id: conversationId },
      });

      if (!conversation) {
        return;
      }

      // Verify user is part of this conversation
      if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
        console.warn(`User ${userId} tried to send typing indicator for conversation ${conversationId} they're not part of`);
        return;
      }

      // Get the other user's ID
      const otherUserId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;
      const otherUserRoom = `user_${otherUserId}`;

      // Send typing indicator ONLY to the other user's room
      this.io.to(otherUserRoom).emit('typing', {
        userId,
        conversationId,
      });
    } catch (error) {
      console.error('Typing error:', error);
    }
  }

  private async updateUserStatus(userId: number, status: string, lastSeen?: Date): Promise<void> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user) {
        user.status = status;
        user.lastSeen = lastSeen || new Date();
        await this.userRepository.save(user);
      }
    } catch (error) {
      console.error('Update user status error:', error);
    }
  }

  private async markPendingMessagesAsDelivered(userId: number, socket: AuthSocket): Promise<void> {
    try {
      // Find all undelivered messages where this user is the receiver
      const undeliveredMessages = await this.messageRepository.find({
        where: {
          receiverId: userId,
          isDelivered: false,
        },
      });

      if (undeliveredMessages.length > 0) {
        console.log(`User ${userId} came online. Marking ${undeliveredMessages.length} messages as delivered`);

        // Mark each message as delivered and notify sender
        for (const message of undeliveredMessages) {
          message.isDelivered = true;
          await this.messageRepository.save(message);

          // Notify the sender that message was delivered
          const senderRoom = `user_${message.senderId}`;
          this.io.to(senderRoom).emit('messageDelivered', {
            messageId: message.id,
            conversationId: message.conversationId,
          });

          console.log(`Message ${message.id} marked as delivered to user ${userId}`);
        }
      }
    } catch (error) {
      console.error('Mark pending messages as delivered error:', error);
    }
  }

  private async handleUpdateMessage(socket: AuthSocket, data: { messageId: number; content: string }): Promise<void> {
    try {
      const userId = socket.userId!;
      const { messageId, content } = data;

      if (!content || !content.trim()) {
        socket.emit('error', { message: 'Content is required' });
        return;
      }

      const message = await this.messageRepository.findOne({
        where: { id: messageId },
      });

      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      // Only sender can update their message
      if (message.senderId !== userId) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      // Cannot update deleted message
      if (message.isDeleted) {
        socket.emit('error', { message: 'Cannot update deleted message' });
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

      console.log(`Message ${messageId} updated by user ${userId}. Edit history count: ${editHistory.length}`);

      // Prepare message for sending (exclude sensitive backup fields)
      const messageToSend = this.sanitizeMessage(message);

      // Send updated message to both sender and receiver
      socket.emit('messageUpdated', messageToSend);

      const receiverRoom = `user_${message.receiverId}`;
      this.io.to(receiverRoom).emit('messageUpdated', messageToSend);
    } catch (error) {
      console.error('Update message error:', error);
      socket.emit('error', { message: 'Failed to update message' });
    }
  }

  private async handleDeleteMessage(socket: AuthSocket, data: { messageId: number }): Promise<void> {
    try {
      const userId = socket.userId!;
      const { messageId } = data;

      const message = await this.messageRepository.findOne({
        where: { id: messageId },
      });

      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      // Only sender can delete their message
      if (message.senderId !== userId) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      // Soft delete - original content is backed up in originalContent field
      message.isDeleted = true;
      message.deletedAt = new Date();
      message.content = 'This message was deleted'; // Safe to change since originalContent has backup
      await this.messageRepository.save(message);

      console.log(`Message ${messageId} deleted by user ${userId}. Original content preserved in originalContent field.`);

      // Prepare message for sending (exclude sensitive backup fields)
      const messageToSend = this.sanitizeMessage(message);

      // Send deleted message to both sender and receiver
      socket.emit('messageDeleted', messageToSend);

      const receiverRoom = `user_${message.receiverId}`;
      this.io.to(receiverRoom).emit('messageDeleted', messageToSend);
    } catch (error) {
      console.error('Delete message error:', error);
      socket.emit('error', { message: 'Failed to delete message' });
    }
  }

  private sanitizeMessage(message: any): any {
    // Remove backup fields from API responses
    const { originalContent, editHistory, ...sanitized } = message;
    return sanitized;
  }
}
