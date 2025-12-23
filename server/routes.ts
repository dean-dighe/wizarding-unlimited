import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerChatRoutes } from "./replit_integrations/chat/routes";
import { registerImageRoutes } from "./replit_integrations/image/routes";
import { registerTTSRoutes } from "./replit_integrations/tts/routes";
import { chatStorage } from "./replit_integrations/chat/storage";
import { generateStoryArc } from "./replit_integrations/story/engine";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OLLAMA_API_KEY || "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "https://gpt.netsuite.tech/v1",
});

async function generateCharacterDescription(playerName: string, house: string | null): Promise<string> {
  try {
    const houseColors: Record<string, string> = {
      "Gryffindor": "crimson and gold",
      "Slytherin": "emerald and silver", 
      "Ravenclaw": "blue and bronze",
      "Hufflepuff": "yellow and black"
    };
    
    const prompt = `Generate a detailed visual description of a young first-year Hogwarts student named ${playerName}${house ? ` sorted into ${house}` : ''} for consistent illustration purposes. 

Include SPECIFIC details about:
- Hair: color, length, texture, style
- Eyes: color, shape, expression
- Skin: tone, any distinctive features like freckles
- Face: shape, notable features
- Build: height, body type for an 11-year-old
- Clothing: ${house ? `Hogwarts robes with ${houseColors[house]} trim` : 'new black Hogwarts robes'}
- Posture and demeanor
- Any distinctive accessories or items

Write it as a single paragraph, approximately 80-100 words, in third person, suitable for an illustrator to recreate consistently across multiple scenes. Start directly with the description, no preamble.`;

    const response = await openai.chat.completions.create({
      model: process.env.OLLAMA_MODEL || "qwen3-coder:30b",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    });

    return response.choices[0]?.message?.content?.trim() || `A young first-year student named ${playerName} with neat dark hair, bright curious eyes, and an eager expression, wearing new black Hogwarts robes${house ? ` with ${houseColors[house]} ${house} trim` : ''}.`;
  } catch (error) {
    console.error("Error generating character description:", error);
    return `A young first-year student named ${playerName} with neat dark hair, bright curious eyes, and an eager expression, wearing new black Hogwarts robes.`;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register integration routes
  registerChatRoutes(app);
  registerImageRoutes(app);
  registerTTSRoutes(app);

  // Game Init Route
  app.post(api.game.init.path, async (req, res) => {
    try {
      const { playerName, house } = api.game.init.input.parse(req.body);

      // 1. Create a new conversation
      const conversation = await chatStorage.createConversation(`Adventure for ${playerName}`);

      // 2. Generate story arc and character description in parallel
      const [storyArc, characterDescription] = await Promise.all([
        generateStoryArc(playerName, house || null),
        generateCharacterDescription(playerName, house || null)
      ]);

      // 3. Initialize Game State with character description and story arc
      await storage.createGameState({
        conversationId: conversation.id,
        playerName,
        house: house || null,
        health: 100,
        inventory: ["Wand", "Hogwarts Robes"],
        spells: [], // Start with no known spells - will learn them during the adventure
        location: "Platform 9¾",
        gameTime: "September 1st, 1991 - 10:30 AM",
        characterDescription,
        storyArc,
        decisionCount: 0,
        storySummary: null,
        lastSummarizedAt: 0,
      });

      // 3. Seed the AI context (System Prompt) with story arc
      const currentChapter = storyArc.chapters[storyArc.currentChapterIndex];
      const systemPrompt = `
You are a master storyteller narrating a Harry Potter text adventure.
The protagonist is ${playerName}${house ? `, a proud member of House ${house}` : ''}.

SETTING: It is September 1st, 1991. ${playerName} has just arrived at Platform 9¾ and is boarding the Hogwarts Express for their first year at Hogwarts School of Witchcraft and Wizardry.

===== THE STORY ARC =====
TITLE: "${storyArc.title}"
PREMISE: ${storyArc.premise}

CURRENT CHAPTER: ${currentChapter.title}
OBJECTIVE: ${currentChapter.objective}
KEY EVENTS TO WEAVE IN: ${currentChapter.keyEvents.join(", ")}

Your job is to naturally guide the story toward the chapter objectives while respecting player agency. Plant seeds for upcoming events. Make the mystery compelling and the stakes personal.
=========================

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

5. If the story involves ANY changes to the player's state, include state change tags BEFORE the choices:
   - For health changes: [HEALTH: +10] or [HEALTH: -15] (relative change, can be positive or negative)
   - For new items: [ITEM_ADD: Item Name] (one tag per item)
   - For lost/used items: [ITEM_REMOVE: Item Name] (one tag per item)
   - For learning new spells: [SPELL_LEARN: Spell Name] (one tag per spell)
   - For location changes: [LOCATION: New Location Name]
   
   Examples:
   [HEALTH: -10]
   [ITEM_ADD: Chocolate Frog]
   [SPELL_LEARN: Lumos]
   [LOCATION: Hogwarts Express - Compartment 7]

Make choices meaningful - some safe, some risky, some social, some exploratory. At least one choice should relate to the current chapter objective.

PLAYER STATE TRACKING:
You are responsible for tracking the player's current state. When narrative events affect the player:
- Taking damage or getting healed affects HEALTH (range 0-100)
- Finding, buying, or receiving items adds to INVENTORY
- Losing, using, or giving away items removes from INVENTORY  
- Learning new spells in classes or from books adds to KNOWN SPELLS
- Moving to new locations updates LOCATION

Be generous with spell learning during classes and tutoring scenes. Be realistic about item usage and health effects.
      `;

      await chatStorage.createMessage(conversation.id, "system", systemPrompt);

      // 4. Generate the opening message that hints at the story arc
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
        message: introText,
        storyArc: {
          title: storyArc.title,
          premise: storyArc.premise,
          currentChapter: currentChapter.title,
          totalChapters: storyArc.chapters.length
        }
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
      playerName: state.playerName,
      house: state.house,
      health: state.health ?? 100,
      inventory: (state.inventory as string[]) ?? [],
      spells: (state.spells as string[]) ?? [],
      location: state.location ?? "Unknown",
      gameTime: state.gameTime ?? "Unknown",
    });
  });

  return httpServer;
}
