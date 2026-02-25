# WhatsApp Chat Application - Backend

A real-time chat application backend built with Node.js, Express, TypeORM, PostgreSQL, and Socket.IO.

## Features

- 🔐 JWT Authentication
- 💬 Real-time messaging with Socket.IO
- 👥 User search and discovery
- 📱 Conversation management
- ✓ Read receipts
- ⌨️ Typing indicators
- 🟢 Online/offline status
- 📦 PostgreSQL database with TypeORM

## Tech Stack

- **Node.js** - Runtime environment
- **Express** - Web framework
- **TypeORM** - ORM for database operations
- **PostgreSQL** - Database
- **Socket.IO** - Real-time communication
- **JWT** - Authentication
- **TypeScript** - Type safety

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- npm or yarn

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create PostgreSQL database:
```sql
CREATE DATABASE whatsapp_chat;
```

3. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

4. Update `.env` with your configuration:
```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_DATABASE=whatsapp_chat

JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d

CORS_ORIGIN=http://localhost:4200
```

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile (protected)

### Users
- `GET /api/users/search?q=query` - Search users (protected)
- `GET /api/users/:id` - Get user by ID (protected)

### Conversations
- `GET /api/conversations` - Get user conversations (protected)
- `POST /api/conversations` - Create/get conversation (protected)

### Messages
- `GET /api/conversations/:conversationId/messages` - Get messages (protected)
- `PUT /api/messages/:messageId/read` - Mark message as read (protected)

### Health Check
- `GET /api/health` - API health status

## Socket.IO Events

### Client → Server
- `sendMessage` - Send a new message
  ```typescript
  { receiverId: number, content: string }
  ```
- `markAsRead` - Mark message as read
  ```typescript
  { messageId: number }
  ```
- `typing` - User is typing
  ```typescript
  { conversationId: number }
  ```

### Server → Client
- `newMessage` - New message received
  ```typescript
  Message
  ```
- `messageRead` - Message was read
  ```typescript
  { messageId: number, userId: number }
  ```
- `userOnline` - User came online
  ```typescript
  { userId: number }
  ```
- `userOffline` - User went offline
  ```typescript
  { userId: number }
  ```
- `typing` - Other user is typing
  ```typescript
  { userId: number, conversationId: number }
  ```

## Project Structure

```
chat-backend/
├── src/
│   ├── config/
│   │   └── database.ts          # Database configuration
│   ├── entities/
│   │   ├── User.ts              # User entity
│   │   ├── Message.ts           # Message entity
│   │   └── Conversation.ts      # Conversation entity
│   ├── controllers/
│   │   ├── auth.controller.ts   # Authentication logic
│   │   ├── user.controller.ts   # User operations
│   │   ├── conversation.controller.ts
│   │   └── message.controller.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts   # JWT verification
│   │   └── validation.middleware.ts
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── user.routes.ts
│   │   ├── conversation.routes.ts
│   │   ├── message.routes.ts
│   │   └── index.ts             # Routes aggregation
│   ├── socket/
│   │   └── socket.handler.ts    # Socket.IO logic
│   └── index.ts                 # Application entry point
├── package.json
├── tsconfig.json
└── README.md
```

## Database Schema

### Users Table
- id (PK)
- username (unique)
- email (unique)
- password (hashed)
- avatarUrl
- status
- lastSeen
- createdAt
- updatedAt

### Messages Table
- id (PK)
- content
- senderId (FK → users)
- receiverId (FK → users)
- conversationId (FK → conversations)
- isRead
- createdAt
- updatedAt

### Conversations Table
- id (PK)
- user1Id (FK → users)
- user2Id (FK → users)
- createdAt
- updatedAt

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Protected routes with middleware
- Input validation with express-validator
- CORS configuration
- SQL injection prevention (TypeORM parameterization)

## Development

The application uses:
- **nodemon** for auto-restart during development
- **ts-node** for TypeScript execution
- **TypeORM** for database migrations and schema sync

## License

ISC

