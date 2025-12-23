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
        location: "Platform 9¾",
        gameTime: "September 1st, 1991 - 10:30 AM",
      });

      // 3. Seed the AI context (System Prompt)
      const systemPrompt = `
You are a master storyteller narrating a Harry Potter text adventure.
The protagonist is ${playerName}${house ? `, a proud member of House ${house}` : ''}.

SETTING: It is September 1st, 1991. ${playerName} has just arrived at Platform 9¾ and is boarding the Hogwarts Express for their first year at Hogwarts School of Witchcraft and Wizardry.

WRITING STYLE:
- Write in second person ("You step onto the train...") like a classic Choose Your Own Adventure novel
- Use rich, atmospheric prose with sensory details - describe sights, sounds, smells, and feelings
- Channel the whimsical yet dangerous tone of J.K. Rowling's world
- Keep responses between 2-3 paragraphs, evocative but not overlong
- Include dialogue when characters speak, properly formatted with quotation marks

CRITICAL REQUIREMENTS:
1. ALWAYS start your response with the current in-game time in this exact format:
   [TIME: Month Day, Year - Hour:Minutes AM/PM]
   Example: [TIME: September 1st, 1991 - 11:45 AM]
   
2. Time should progress logically based on the player's actions (minutes or hours passing)

3. IMMEDIATELY after the time tag, include a scene description for illustration in this format:
   [SCENE: A detailed visual description of the current scene for an illustrator]
   
   The SCENE description must:
   - Be 30-50 words describing the visual setting
   - Include specific details: location, lighting, atmosphere, key objects
   - Describe character positions and expressions if relevant
   - Use vivid visual language (colors, textures, mood)
   - Be in third person describing what an artist should paint
   
   Example: [SCENE: A young wizard in dark robes stands on a misty train platform, the scarlet Hogwarts Express billowing steam behind them. Warm golden lamplight filters through the fog. Owls in cages and stacked trunks surround excited students.]

4. ALWAYS end with exactly 4 choices in this format:
   [Choice 1: Description]
   [Choice 2: Description]
   [Choice 3: Description]
   [Choice 4: Description]

Make choices meaningful - some safe, some risky, some social, some exploratory.
      `;

      await chatStorage.createMessage(conversation.id, "system", systemPrompt);

      // 4. Generate the opening message from AI to start the game
      // We manually create a "user" trigger message to get the ball rolling, or just let the client handle the first interaction.
      // Better: Let's insert a "Welcome" message from the "assistant" immediately so the user sees something.
      // Ideally we'd call OpenAI here, but for speed, let's just insert a hardcoded intro or let the client trigger the first generation.
      // Let's Insert a hardcoded intro to be safe and fast.
      
      const introText = `[TIME: September 1st, 1991 - 10:30 AM]
[SCENE: A young first-year wizard in new black robes stands on the bustling Platform 9¾, the magnificent scarlet Hogwarts Express billowing white steam behind them. Golden morning light filters through the station's Victorian ironwork. Owls hoot from brass cages, trunks are stacked high, and excited students in robes embrace tearful parents amid the magical chaos.]

The scarlet steam engine gleams before you, wisps of white smoke curling into the grey London sky. Platform 9¾ buzzes with the chaos of departure—owls hooting from their cages, parents calling last-minute advice, and trunks scraping along the ancient stone. You clutch your ticket tightly, heart hammering with a mixture of terror and wonder.

You've done it. You've actually made it. The Hogwarts Express awaits, and with it, a world you've only dreamed about. Families embrace tearfully around you, but your eyes are fixed on the train's gleaming brass fixtures and the promise they hold. A porter gestures you forward—it's time to find a compartment.

[Choice 1: Search for an empty compartment where you can collect your thoughts]
[Choice 2: Follow a group of laughing students who seem to know where they're going]
[Choice 3: Help a small, round-faced boy who's struggling with a heavy trunk]
[Choice 4: Investigate the mysterious hooded figure lingering near the last carriage]`;
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
      gameTime: state.gameTime ?? "Unknown",
    });
  });

  return httpServer;
}
