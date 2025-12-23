import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerChatRoutes } from "./replit_integrations/chat/routes";
import { registerImageRoutes } from "./replit_integrations/image/routes";
import { chatStorage } from "./replit_integrations/chat/storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register integration routes
  registerChatRoutes(app);
  registerImageRoutes(app);

  // Game Init Route
  app.post(api.game.init.path, async (req, res) => {
    try {
      const { playerName, house } = api.game.init.input.parse(req.body);

      // 1. Create a new conversation
      const conversation = await chatStorage.createConversation(`Adventure for ${playerName}`);

      // 2. Initialize Game State
      await storage.createGameState({
        conversationId: conversation.id,
        house: house || null,
        health: 100,
        inventory: ["Wand", "Hogwarts Robes"],
        location: "Hogwarts Express",
      });

      // 3. Seed the AI context (System Prompt)
      const systemPrompt = `
You are the Dungeon Master for a Harry Potter text adventure game. 
The player is named "${playerName}". 
${house ? `They belong to House ${house}.` : "They have not been sorted yet."}
Current location: Hogwarts Express.

Your goal is to lead the player on a magical adventure. 
Keep responses immersive, descriptive, but concise (under 3 paragraphs).
Use typical RPG elements.

IMPORTANT: Always end your response with exactly 4 numbered choices in this format:
[Choice 1: Description of first action]
[Choice 2: Description of second action]
[Choice 3: Description of third action]
[Choice 4: Description of fourth action]

Make choices thematic, engaging, and relevant to the current situation.
      `;

      await chatStorage.createMessage(conversation.id, "system", systemPrompt);

      // 4. Generate the opening message from AI to start the game
      // We manually create a "user" trigger message to get the ball rolling, or just let the client handle the first interaction.
      // Better: Let's insert a "Welcome" message from the "assistant" immediately so the user sees something.
      // Ideally we'd call OpenAI here, but for speed, let's just insert a hardcoded intro or let the client trigger the first generation.
      // Let's Insert a hardcoded intro to be safe and fast.
      
      const introText = `Welcome, ${playerName}, to the Wizarding World! The Hogwarts Express whistle blows, steam filling the platform. You find a compartment.

[Choice 1: Explore the corridor to meet other students]
[Choice 2: Settle into the compartment and wait for it to depart]
[Choice 3: Visit the food cart in the next car over]
[Choice 4: Gaze out the window at Diagon Alley]`;
      await chatStorage.createMessage(conversation.id, "assistant", introText);

      res.status(201).json({
        conversationId: conversation.id,
        message: introText
      });

    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        console.error(err);
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  // Get Game State
  app.get(api.game.getState.path, async (req, res) => {
    const conversationId = Number(req.params.conversationId);
    const state = await storage.getGameState(conversationId);
    
    if (!state) {
      return res.status(404).json({ message: "Game state not found" });
    }

    res.json({
      house: state.house,
      health: state.health ?? 100,
      inventory: (state.inventory as string[]) ?? [],
      location: state.location ?? "Unknown",
    });
  });

  return httpServer;
}
