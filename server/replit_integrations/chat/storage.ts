import { db } from "../../db";
import { conversations, messages } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import crypto, { timingSafeEqual } from "crypto";

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export interface IChatStorage {
  getConversation(id: number): Promise<typeof conversations.$inferSelect | undefined>;
  getAllConversations(): Promise<(typeof conversations.$inferSelect)[]>;
  createConversation(title: string): Promise<typeof conversations.$inferSelect>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number, limit?: number): Promise<(typeof messages.$inferSelect)[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<typeof messages.$inferSelect>;
  deleteMessage(id: number): Promise<void>;
  validateSessionToken(conversationId: number, token: string): Promise<boolean>;
}

export const chatStorage: IChatStorage = {
  async getConversation(id: number) {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  },

  async getAllConversations() {
    return db.select().from(conversations).orderBy(desc(conversations.createdAt));
  },

  async createConversation(title: string) {
    const sessionToken = generateSessionToken();
    const [conversation] = await db.insert(conversations).values({ title, sessionToken }).returning();
    return conversation;
  },

  async deleteConversation(id: number) {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  },

  async getMessagesByConversation(conversationId: number, limit?: number) {
    const query = db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
    if (limit) {
      return query.limit(limit);
    }
    return query;
  },

  async createMessage(conversationId: number, role: string, content: string) {
    const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
    return message;
  },

  async deleteMessage(id: number) {
    await db.delete(messages).where(eq(messages.id, id));
  },

  async validateSessionToken(conversationId: number, token: string) {
    if (!token) return false;
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
    if (!conversation || !conversation.sessionToken) return false;

    // Use timing-safe comparison to prevent timing attacks
    const storedBuffer = Buffer.from(conversation.sessionToken, 'utf8');
    const providedBuffer = Buffer.from(token, 'utf8');
    if (storedBuffer.length !== providedBuffer.length) return false;
    return timingSafeEqual(storedBuffer, providedBuffer);
  },
};

