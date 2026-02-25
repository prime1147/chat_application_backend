import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { Like } from 'typeorm';

export class UserController {
  private userRepository = AppDataSource.getRepository(User);

  searchUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { q } = req.query;
      const currentUserId = (req as any).userId;

      if (!q || typeof q !== 'string') {
        res.status(400).json({ message: 'Search query is required' });
        return;
      }

      const users = await this.userRepository.find({
        where: [
          { username: Like(`%${q}%`) },
          { email: Like(`%${q}%`) },
        ],
        select: ['id', 'username', 'email', 'avatarUrl', 'status', 'lastSeen'],
        take: 10,
      });

      // Filter out current user
      const filteredUsers = users.filter(user => user.id !== currentUserId);

      res.json(filteredUsers);
    } catch (error) {
      console.error('Search users error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  getUserById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const user = await this.userRepository.findOne({
        where: { id: parseInt(id) },
        select: ['id', 'username', 'email', 'avatarUrl', 'status', 'lastSeen'],
      });

      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      res.json(user);
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}

