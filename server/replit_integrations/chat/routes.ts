import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { chatStorage } from "./storage";

const openai = new OpenAI({
  apiKey: process.env.OLLAMA_API_KEY || "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "https://gpt.netsuite.tech/v1",
});

const XAI_API_URL = "https://api.x.ai/v1/images/generations";

async function generateSceneImage(storyContent: string): Promise<string | null> {
  try {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      console.log("XAI_API_KEY not configured, skipping image generation");
      return null;
    }

    // Extract key visual elements from the story for the image prompt
    // Strip out the metadata and choices
    const cleanContent = storyContent
      .replace(/\[TIME: [^\]]+\]\n?/g, '')
      .replace(/\[Choice \d+: [^\]]+\]\n?/g, '')
      .trim();

    // Create a focused image prompt based on the story content
    const imagePrompt = `Harry Potter wizarding world illustration: ${cleanContent.slice(0, 300)}. Atmospheric, magical, painterly style with warm lighting, detailed environment, no text or words in image.`;

    const response = await fetch(XAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-2-image-1212",
        prompt: imagePrompt,
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

      // Get conversation history for context
      const messages = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Stream response from Ollama
      const stream = await openai.chat.completions.create({
        model: process.env.OLLAMA_MODEL || "qwen3-coder:30b",
        messages: chatMessages,
        stream: true,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      // Text streaming complete - signal that image generation is starting
      res.write(`data: ${JSON.stringify({ textDone: true, imagePending: true })}\n\n`);

      // Generate scene image based on story content
      const imageUrl = await generateSceneImage(fullResponse);
      
      // Embed image URL in the message content for persistence
      let finalContent = fullResponse;
      if (imageUrl) {
        finalContent = `[IMAGE: ${imageUrl}]\n${fullResponse}`;
        res.write(`data: ${JSON.stringify({ imageUrl })}\n\n`);
      }

      // Save assistant message with embedded image URL
      await chatStorage.createMessage(conversationId, "assistant", finalContent);

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

