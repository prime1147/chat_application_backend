import { DataSource } from 'typeorm';
import { User } from '../entities/User';
import { Message } from '../entities/Message';
import { Conversation } from '../entities/Conversation';
import * as dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'whatsapp_chat',
  synchronize: process.env.NODE_ENV === 'development', // Auto-sync in development only
  logging: process.env.NODE_ENV === 'development',
  entities: [User, Message, Conversation],
  migrations: [],
  subscribers: [],
});

