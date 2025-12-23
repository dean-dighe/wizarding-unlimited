import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { chatStorage } from "./storage";
import { storage } from "../../storage";
import { 
  shouldSummarize, 
  summarizeStory, 
  checkChapterProgress,
  buildContextWithSummary 
} from "../story/engine";
import type { StoryArc } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OLLAMA_API_KEY || "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "https://gpt.netsuite.tech/v1",
});

const XAI_API_URL = "https://api.x.ai/v1/images/generations";

const MAX_PROMPT_LENGTH = 1000; // xAI limit is 1024, leave buffer

async function generateSceneImage(storyContent: string, characterDescription?: string): Promise<string | null> {
  try {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      console.log("XAI_API_KEY not configured, skipping image generation");
      return null;
    }

    // Extract the [SCENE: ...] tag from the story content for the image prompt
    const sceneMatch = storyContent.match(/\[SCENE: ([^\]]+)\]/);
    let sceneDescription: string;
    
    if (sceneMatch) {
      // Use the explicit scene description from the AI
      sceneDescription = sceneMatch[1].slice(0, 150);
    } else {
      // Fallback: extract key visual elements from the story
      const cleanContent = storyContent
        .replace(/\[TIME: [^\]]+\]\n?/g, '')
        .replace(/\[Choice \d+: [^\]]+\]\n?/g, '')
        .trim();
      sceneDescription = cleanContent.slice(0, 150);
    }

    // Condensed character description (max 100 chars)
    const characterBrief = characterDescription 
      ? ` Protagonist: ${characterDescription.slice(0, 100)}` 
      : '';

    // Compact image prompt optimized for 1024 char limit
    // Base style (~550 chars) + scene (~150) + character (~100) = ~800 chars
    const imagePrompt = `Fantasy book illustration, 1990s British wizarding world: ${sceneDescription}${characterBrief}

STYLE: Painterly digital art, Arthur Rackham/Alan Lee inspired, oil-painting textures, romantic fantasy.
LIGHTING: Warm candlelight, cool moonlight, god rays, magical glow, dramatic shadows.
COLORS: Autumnal golds, burgundy, forest green, midnight blue, amber highlights, parchment tones.
SETTING: Gothic Victorian, stone textures, stained glass, floating dust, brass fixtures, leather books.
MOOD: Cozy yet mysterious, ancient wonder, lived-in magical spaces.
AVOID: Text, words, logos, modern elements, anime, photorealism.`;

    // Final safety truncation
    const finalPrompt = imagePrompt.slice(0, MAX_PROMPT_LENGTH);

    const response = await fetch(XAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-2-image-1212",
        prompt: finalPrompt,
        n: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("xAI image generation error:", errorText);
      return null;
    }

    const data = await response.json();
    return data.data?.[0]?.url || null;
  } catch (error) {
    console.error("Error generating scene image:", error);
    return null;
  }
}

export function registerChatRoutes(app: Express): void {
  // Get all conversations
  app.get("/api/conversations", async (req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single conversation with messages
  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create new conversation
  app.post("/api/conversations", async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // Delete conversation
  app.delete("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Send message and get AI response (streaming)
  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;

      // Save user message
      await chatStorage.createMessage(conversationId, "user", content);

      // Get game state for character description and story context
      const gameState = await storage.getGameState(conversationId);
      const characterDescription = gameState?.characterDescription || undefined;
      const storyArc = gameState?.storyArc as StoryArc | undefined;
      const currentDecisionCount = (gameState?.decisionCount || 0) + 1;
      const storySummary = gameState?.storySummary || null;
      const lastSummarizedAt = gameState?.lastSummarizedAt || 0;

      // Update decision count immediately
      await storage.updateGameState(conversationId, { decisionCount: currentDecisionCount });

      // Get conversation history for context
      const messages = await chatStorage.getMessagesByConversation(conversationId);
      
      // Build context with story arc and potential summary
      let chatMessages: { role: "user" | "assistant" | "system"; content: string }[];
      
      if (storyArc) {
        const rawMessages = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        
        // Find the system prompt (first system message)
        const systemMessage = messages.find(m => m.role === "system");
        const systemPrompt = systemMessage?.content || "";
        
        chatMessages = buildContextWithSummary(
          systemPrompt,
          storySummary,
          storyArc,
          rawMessages.filter(m => m.role !== "system")
        );
      } else {
        // Fallback to simple message list
        chatMessages = messages.map((m) => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        }));
      }

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Get response from Ollama (non-streaming to buffer complete text)
      const stream = await openai.chat.completions.create({
        model: process.env.OLLAMA_MODEL || "qwen3-coder:30b",
        messages: chatMessages,
        stream: true,
      });

      let fullResponse = "";

      // Accumulate all chunks without sending to client
      for await (const chunk of stream) {
        const chunkContent = chunk.choices[0]?.delta?.content || "";
        if (chunkContent) {
          fullResponse += chunkContent;
        }
      }

      // Text complete - send full content in one event, then signal image generation starting
      res.write(`data: ${JSON.stringify({ fullContent: fullResponse, textDone: true, imagePending: true })}\n\n`);

      // Generate scene image based on story content with character description for consistency
      const imageUrl = await generateSceneImage(fullResponse, characterDescription);
      
      // Embed image URL in the message content for persistence
      let finalContent = fullResponse;
      if (imageUrl) {
        finalContent = `[IMAGE: ${imageUrl}]\n${fullResponse}`;
        res.write(`data: ${JSON.stringify({ imageUrl })}\n\n`);
      }

      // Save assistant message with embedded image URL
      await chatStorage.createMessage(conversationId, "assistant", finalContent);

      // Check if we should summarize (every 10 decisions)
      if (storyArc && shouldSummarize(currentDecisionCount, lastSummarizedAt)) {
        console.log(`[Story] Decision ${currentDecisionCount}: Triggering summarization...`);
        
        // Get fresh messages for summarization
        const allMessages = await chatStorage.getMessagesByConversation(conversationId);
        const rawMessages = allMessages.map(m => ({ role: m.role, content: m.content }));
        
        // Summarize the story
        const newSummary = await summarizeStory(rawMessages, storyArc, storySummary);
        
        // Update game state with new summary
        await storage.updateGameState(conversationId, {
          storySummary: newSummary,
          lastSummarizedAt: currentDecisionCount
        });
        
        console.log(`[Story] Summary updated at decision ${currentDecisionCount}`);

        // Check for chapter progression with summary context
        const progressContext = `STORY SUMMARY:\n${newSummary}\n\nLATEST EVENTS:\n${fullResponse}`;
        const { shouldAdvance, updatedArc } = await checkChapterProgress(storyArc, progressContext);
        if (shouldAdvance) {
          await storage.updateGameState(conversationId, { storyArc: updatedArc });
          const newChapter = updatedArc.chapters[updatedArc.currentChapterIndex];
          console.log(`[Story] Advanced to: ${newChapter.title}`);
          
          // Send chapter advancement notification to client
          res.write(`data: ${JSON.stringify({ 
            chapterAdvance: true, 
            chapter: newChapter.title,
            chapterIndex: updatedArc.currentChapterIndex + 1,
            totalChapters: updatedArc.chapters.length
          })}\n\n`);
        }
      }

      // Send story progress info
      if (storyArc) {
        const currentChapter = storyArc.chapters[storyArc.currentChapterIndex];
        res.write(`data: ${JSON.stringify({ 
          storyProgress: {
            chapter: currentChapter.title,
            chapterIndex: storyArc.currentChapterIndex + 1,
            totalChapters: storyArc.chapters.length,
            decisionCount: currentDecisionCount
          }
        })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      // Check if headers already sent (SSE streaming started)
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
}

