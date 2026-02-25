-- Database Cleanup Script for WhatsApp Clone
-- This script identifies and helps fix data integrity issues

-- ============================================
-- 1. Identify messages that don't match their conversation participants
-- ============================================
SELECT 
    m.id as message_id,
    m."conversationId",
    m."senderId",
    m."receiverId",
    c."user1Id" as conv_user1,
    c."user2Id" as conv_user2,
    'Invalid: Sender/Receiver mismatch' as issue
FROM messages m
INNER JOIN conversations c ON m."conversationId" = c.id
WHERE 
    (m."senderId" NOT IN (c."user1Id", c."user2Id") OR m."receiverId" NOT IN (c."user1Id", c."user2Id"))
    OR (m."senderId" = m."receiverId");

-- ============================================
-- 2. Identify orphaned messages (no conversation)
-- ============================================
SELECT 
    m.id as message_id,
    m."conversationId",
    m."senderId",
    m."receiverId",
    'Invalid: Conversation not found' as issue
FROM messages m
LEFT JOIN conversations c ON m."conversationId" = c.id
WHERE c.id IS NULL;

-- ============================================
-- 3. Identify conversations with invalid user IDs
-- ============================================
SELECT 
    c.id as conversation_id,
    c."user1Id",
    c."user2Id",
    'Invalid: User not found' as issue
FROM conversations c
LEFT JOIN users u1 ON c."user1Id" = u1.id
LEFT JOIN users u2 ON c."user2Id" = u2.id
WHERE u1.id IS NULL OR u2.id IS NULL;

-- ============================================
-- 4. Find duplicate conversations (same users, multiple conversations)
-- ============================================
SELECT 
    LEAST(c1."user1Id", c1."user2Id") as user_a,
    GREATEST(c1."user1Id", c1."user2Id") as user_b,
    COUNT(*) as duplicate_count,
    array_agg(c1.id) as conversation_ids
FROM conversations c1
GROUP BY LEAST(c1."user1Id", c1."user2Id"), GREATEST(c1."user1Id", c1."user2Id")
HAVING COUNT(*) > 1;

-- ============================================
-- 5. OPTIONAL: Delete orphaned messages
-- WARNING: This will permanently delete data!
-- Uncomment only after reviewing the results from query #2
-- ============================================
-- DELETE FROM messages 
-- WHERE id IN (
--     SELECT m.id
--     FROM messages m
--     LEFT JOIN conversations c ON m."conversationId" = c.id
--     WHERE c.id IS NULL
-- );

-- ============================================
-- 6. OPTIONAL: Fix messages with wrong conversation
-- WARNING: This is a complex operation - review carefully!
-- This attempts to move messages to the correct conversation
-- ============================================
-- WITH correct_conversations AS (
--     SELECT 
--         m.id as message_id,
--         c.id as correct_conversation_id
--     FROM messages m
--     INNER JOIN conversations c ON 
--         ((c."user1Id" = m."senderId" AND c."user2Id" = m."receiverId") OR
--          (c."user2Id" = m."senderId" AND c."user1Id" = m."receiverId"))
--     WHERE m."conversationId" != c.id
-- )
-- UPDATE messages m
-- SET "conversationId" = cc.correct_conversation_id
-- FROM correct_conversations cc
-- WHERE m.id = cc.message_id;

-- ============================================
-- 7. View all conversations for debugging
-- ============================================
SELECT 
    c.id as conversation_id,
    c."user1Id",
    u1.username as user1_name,
    c."user2Id",
    u2.username as user2_name,
    (SELECT COUNT(*) FROM messages WHERE "conversationId" = c.id) as message_count,
    c."createdAt",
    c."updatedAt"
FROM conversations c
LEFT JOIN users u1 ON c."user1Id" = u1.id
LEFT JOIN users u2 ON c."user2Id" = u2.id
ORDER BY c."updatedAt" DESC;

-- ============================================
-- 8. View all messages with conversation details
-- ============================================
SELECT 
    m.id as message_id,
    m."conversationId",
    m.content,
    m."senderId",
    us.username as sender_name,
    m."receiverId",
    ur.username as receiver_name,
    c."user1Id" as conv_user1,
    c."user2Id" as conv_user2,
    m."isRead",
    m."isDelivered",
    m."createdAt"
FROM messages m
LEFT JOIN conversations c ON m."conversationId" = c.id
LEFT JOIN users us ON m."senderId" = us.id
LEFT JOIN users ur ON m."receiverId" = ur.id
ORDER BY m."createdAt" DESC
LIMIT 50;

