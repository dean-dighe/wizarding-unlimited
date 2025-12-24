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
import { SpriteGenerationService } from "../game_assets/sprites";
import { MapGenerationService } from "../game_assets/maps";
import { runCoordinatedPipeline } from "../translator";
import type { PipelineContext } from "../translator";
import type { StoryArc } from "@shared/schema";

const spriteService = new SpriteGenerationService();
const mapService = new MapGenerationService();

const openai = new OpenAI({
  apiKey: process.env.OLLAMA_API_KEY || "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "https://gpt.netsuite.tech/v1",
});

const XAI_API_URL = "https://api.x.ai/v1/images/generations";

const MAX_PROMPT_LENGTH = 1000; // xAI limit is 1024, leave buffer

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20; // 20 requests per minute per IP

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    // New window
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  
  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  record.count++;
  return { allowed: true };
}

// Cleanup old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(rateLimitMap.entries());
  for (const [ip, record] of entries) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 60000);

// Helper to extract session token from Authorization header
function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

interface StateChanges {
  hasChanges: boolean;
  healthChange: number;
  itemsAdded: string[];
  itemsRemoved: string[];
  spellsLearned: string[];
  newLocation: string | null;
}

function parseStateChanges(content: string): StateChanges {
  const changes: StateChanges = {
    hasChanges: false,
    healthChange: 0,
    itemsAdded: [],
    itemsRemoved: [],
    spellsLearned: [],
    newLocation: null
  };

  // Parse health changes: [HEALTH: +10] or [HEALTH: -15]
  const healthRegex = /\[HEALTH:\s*([+-]?\d+)\]/gi;
  let healthMatch;
  while ((healthMatch = healthRegex.exec(content)) !== null) {
    changes.healthChange += parseInt(healthMatch[1], 10);
    changes.hasChanges = true;
  }

  // Parse item additions: [ITEM_ADD: Item Name]
  const itemAddRegex = /\[ITEM_ADD:\s*([^\]]+)\]/gi;
  let itemAddMatch;
  while ((itemAddMatch = itemAddRegex.exec(content)) !== null) {
    changes.itemsAdded.push(itemAddMatch[1].trim());
    changes.hasChanges = true;
  }

  // Parse item removals: [ITEM_REMOVE: Item Name]
  const itemRemoveRegex = /\[ITEM_REMOVE:\s*([^\]]+)\]/gi;
  let itemRemoveMatch;
  while ((itemRemoveMatch = itemRemoveRegex.exec(content)) !== null) {
    changes.itemsRemoved.push(itemRemoveMatch[1].trim());
    changes.hasChanges = true;
  }

  // Parse spell learning: [SPELL_LEARN: Spell Name]
  const spellRegex = /\[SPELL_LEARN:\s*([^\]]+)\]/gi;
  let spellMatch;
  while ((spellMatch = spellRegex.exec(content)) !== null) {
    changes.spellsLearned.push(spellMatch[1].trim());
    changes.hasChanges = true;
  }

  // Parse location changes: [LOCATION: New Location]
  const locationMatch = content.match(/\[LOCATION:\s*([^\]]+)\]/i);
  if (locationMatch) {
    changes.newLocation = locationMatch[1].trim();
    changes.hasChanges = true;
  }

  return changes;
}

// Parse NPC character descriptions from [CHARACTER: Name | Description] tags
function parseNPCDescriptions(content: string): Record<string, string> {
  const npcs: Record<string, string> = {};
  const characterRegex = /\[CHARACTER:\s*([^|]+)\|([^\]]+)\]/gi;
  let match;
  console.log(`[NPC Parse] Searching for CHARACTER tags in response (${content.length} chars)`);
  while ((match = characterRegex.exec(content)) !== null) {
    const name = match[1].trim();
    const description = match[2].trim();
    npcs[name] = description;
    console.log(`[NPC Parse] Found: "${name}" -> "${description.slice(0, 50)}..."`);
  }
  if (Object.keys(npcs).length === 0) {
    console.log(`[NPC Parse] No CHARACTER tags found in response`);
  }
  return npcs;
}

// Strip CHARACTER tags from content after parsing (they should be indexed, not displayed)
function stripCharacterTags(content: string): string {
  // Remove [CHARACTER: Name | Description] tags and any trailing newline
  return content.replace(/\[CHARACTER:\s*[^|]+\|[^\]]+\]\n?/gi, '');
}

// Parse NPC positions from [NPC_POSITION: Name | position] tags for game canvas
function parseNPCPositions(content: string): Record<string, string> {
  const positions: Record<string, string> = {};
  const positionRegex = /\[NPC_POSITION:\s*([^|]+)\|([^\]]+)\]/gi;
  let match;
  while ((match = positionRegex.exec(content)) !== null) {
    const name = match[1].trim();
    const position = match[2].trim().toLowerCase();
    // Validate position is one of the allowed values
    const validPositions = ['north', 'south', 'east', 'west', 'center', 'northeast', 'northwest', 'southeast', 'southwest'];
    if (validPositions.includes(position)) {
      positions[name] = position;
      console.log(`[Canvas] NPC Position: "${name}" at ${position}`);
    }
  }
  return positions;
}

// Strip NPC_POSITION tags from content (they're parsed, not displayed)
function stripPositionTags(content: string): string {
  return content.replace(/\[NPC_POSITION:\s*[^|]+\|[^\]]+\]\n?/gi, '');
}

// Parse character moods from [MOOD: Name | expression] tags for VN portraits
function parseCharacterMoods(content: string): Record<string, string> {
  const moods: Record<string, string> = {};
  const moodRegex = /\[MOOD:\s*([^|]+)\|([^\]]+)\]/gi;
  let match;
  while ((match = moodRegex.exec(content)) !== null) {
    const name = match[1].trim();
    const expression = match[2].trim().toLowerCase();
    // Validate expression is one of the allowed values
    const validExpressions = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'worried', 'determined', 'mysterious', 'scared'];
    if (validExpressions.includes(expression)) {
      moods[name] = expression;
      console.log(`[VN] Character Mood: "${name}" is ${expression}`);
    }
  }
  return moods;
}

// Strip MOOD tags from content (they're parsed, not displayed)
function stripMoodTags(content: string): string {
  return content.replace(/\[MOOD:\s*[^|]+\|[^\]]+\]\n?/gi, '');
}

// Parse choice navigation hints from [Choice N: description → direction] format
function parseChoiceDirections(content: string): Record<number, string> {
  const directions: Record<number, string> = {};
  const choiceRegex = /\[Choice\s*(\d+):\s*([^\]]+?)\s*→\s*(north|south|east|west|center|northeast|northwest|southeast|southwest)\s*\]/gi;
  let match;
  while ((match = choiceRegex.exec(content)) !== null) {
    const choiceNum = parseInt(match[1], 10);
    const direction = match[3].trim().toLowerCase();
    directions[choiceNum] = direction;
    console.log(`[Canvas] Choice ${choiceNum} moves to ${direction}`);
  }
  return directions;
}

// Extract character names mentioned in scene description or story content to find relevant NPC descriptions
function findRelevantNPCs(
  sceneDescription: string, 
  storyContent: string,
  npcDescriptions: Record<string, string>,
  newlyIntroducedNPCs: Record<string, string> = {}
): string[] {
  const relevantDescriptions: string[] = [];
  const searchText = (sceneDescription + ' ' + storyContent).toLowerCase();
  
  console.log(`[NPC Match] Checking ${Object.keys(npcDescriptions).length} stored NPCs + ${Object.keys(newlyIntroducedNPCs).length} new NPCs`);
  
  for (const [name, description] of Object.entries(npcDescriptions)) {
    // Check if the NPC name appears in the scene or story content (case-insensitive)
    // Also check for first name only (e.g., "Marcus" for "Marcus Flint")
    const firstName = name.split(' ')[0];
    if (searchText.includes(name.toLowerCase()) || 
        (firstName.length > 2 && searchText.includes(firstName.toLowerCase()))) {
      relevantDescriptions.push(`${name}: ${description}`);
      console.log(`[NPC Match] Matched stored NPC: "${name}"`);
    }
  }
  
  // Always include newly introduced NPCs since they're likely in the current scene
  for (const [name, description] of Object.entries(newlyIntroducedNPCs)) {
    if (!relevantDescriptions.some(d => d.startsWith(name + ':'))) {
      relevantDescriptions.push(`${name}: ${description}`);
      console.log(`[NPC Match] Including new NPC: "${name}"`);
    }
  }
  
  console.log(`[NPC Match] Total relevant NPCs for image: ${relevantDescriptions.length}`);
  return relevantDescriptions;
}

async function generateSceneImage(
  storyContent: string, 
  characterDescription?: string,
  npcDescriptions?: Record<string, string>,
  newlyIntroducedNPCs?: Record<string, string>
): Promise<string | null> {
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
    
    // Find and include relevant NPC descriptions (existing + newly introduced)
    let npcBrief = '';
    const hasNPCs = (npcDescriptions && Object.keys(npcDescriptions).length > 0) ||
                    (newlyIntroducedNPCs && Object.keys(newlyIntroducedNPCs).length > 0);
    if (hasNPCs) {
      const relevantNPCs = findRelevantNPCs(
        sceneDescription, 
        storyContent, 
        npcDescriptions || {},
        newlyIntroducedNPCs || {}
      );
      if (relevantNPCs.length > 0) {
        // Limit to first 2 NPCs and 80 chars each to stay within limits
        npcBrief = ' ' + relevantNPCs.slice(0, 2).map(d => d.slice(0, 80)).join('. ');
      }
    }

    // Compact image prompt optimized for 1024 char limit
    // Base style (~550 chars) + scene (~150) + protagonist (~100) + NPCs (~160) = ~960 chars
    const imagePrompt = `Classic fantasy book cover art, 1990s British wizarding world: ${sceneDescription}${characterBrief}${npcBrief}

ART STYLE: Rich oil painting aesthetic like classic fantasy book covers. Soft, painterly brushstrokes with visible texture. NOT photorealistic, NOT anime, NOT cartoon. Think John Howe, Alan Lee, or vintage Harry Potter illustrated editions.
FIGURES: Characters have naturalistic proportions, expressive faces with clear emotions, period-accurate 1990s British school uniforms under wizard robes. Children look age-appropriate (13 years old). Robes flow naturally with fabric weight.
MAGIC: Spells manifest as warm golden light, silvery wisps, or colored sparks. Magic glows softly from wand tips. Enchanted objects shimmer subtly. No over-the-top VFX.
ENVIRONMENT: Gothic stone architecture, warm candlelit interiors, misty Scottish highlands, autumn forests. Rich textures in wood, stone, brass, leather.
PALETTE: Warm ambers, deep burgundy, forest greens, midnight blues. Golden highlights, soft shadows.
AVOID: Text, logos, modern items, harsh lighting, plastic textures, exaggerated features.`;

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
      
      // Session validation
      const sessionToken = extractSessionToken(req);
      if (!sessionToken) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const isValid = await chatStorage.validateSessionToken(id, sessionToken);
      if (!isValid) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      // Limit message history to prevent memory issues (game uses summarization anyway)
      const messages = await chatStorage.getMessagesByConversation(id, 100);
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
      
      // Session validation
      const sessionToken = extractSessionToken(req);
      if (!sessionToken) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const isValid = await chatStorage.validateSessionToken(id, sessionToken);
      if (!isValid) {
        return res.status(403).json({ error: "Access denied" });
      }
      
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
      // Rate limiting
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const rateCheck = checkRateLimit(clientIp);
      if (!rateCheck.allowed) {
        res.setHeader('Retry-After', rateCheck.retryAfter || 60);
        return res.status(429).json({ error: "Too many requests. Please slow down." });
      }

      const conversationId = parseInt(req.params.id);
      
      // Session validation
      const sessionToken = extractSessionToken(req);
      if (!sessionToken) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const isValid = await chatStorage.validateSessionToken(conversationId, sessionToken);
      if (!isValid) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { content } = req.body;

      // Input validation
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: "Message content is required" });
      }
      
      const trimmedContent = content.trim();
      if (trimmedContent.length === 0) {
        return res.status(400).json({ error: "Message cannot be empty" });
      }
      
      // Length limit to prevent DoS (player choices are typically short)
      const MAX_MESSAGE_LENGTH = 500;
      if (trimmedContent.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` });
      }

      console.log(`[Chat] Received message for conversation ${conversationId}: "${trimmedContent.slice(0, 50)}..."`);

      // Save user message
      await chatStorage.createMessage(conversationId, "user", trimmedContent);

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

      // Signal to client that we're starting AI generation
      res.write(`data: ${JSON.stringify({ generating: true })}\n\n`);
      console.log(`[Chat] Starting AI generation for conversation ${conversationId}`);

      let fullResponse = "";
      
      try {
        // Get response from Ollama with timeout protection
        console.log(`[Chat] Calling Ollama API...`);
        const stream = await openai.chat.completions.create({
          model: process.env.OLLAMA_MODEL || "qwen3-coder:30b",
          messages: chatMessages,
          stream: true,
        });
        console.log(`[Chat] Got stream, reading chunks...`);

        // Accumulate all chunks
        let chunkCount = 0;
        for await (const chunk of stream) {
          const chunkContent = chunk.choices[0]?.delta?.content || "";
          if (chunkContent) {
            fullResponse += chunkContent;
            chunkCount++;
          }
        }
        console.log(`[Chat] Received ${chunkCount} chunks, total length: ${fullResponse.length}`);

        // Validate we got a meaningful response
        if (!fullResponse || fullResponse.trim().length < 20) {
          throw new Error("AI returned empty or invalid response");
        }
      } catch (aiError: any) {
        console.error("AI generation error:", aiError);
        
        // Delete the user message since AI failed (rollback)
        const allMsgs = await chatStorage.getMessagesByConversation(conversationId);
        const lastUserMsg = allMsgs.filter(m => m.role === "user").pop();
        if (lastUserMsg) {
          await chatStorage.deleteMessage(lastUserMsg.id);
        }
        
        // Rollback decision count
        await storage.updateGameState(conversationId, { decisionCount: currentDecisionCount - 1 });
        
        // Send error to client with retry info
        res.write(`data: ${JSON.stringify({ 
          error: true, 
          errorMessage: "The story enchantment fizzled! The magical narrator seems to have wandered off momentarily.",
          errorType: "ai_generation",
          canRetry: true
        })}\n\n`);
        res.end();
        return;
      }

      // Parse and store any new NPC descriptions BEFORE stripping tags
      const newNPCs = parseNPCDescriptions(fullResponse);
      
      // Parse NPC positions for game canvas
      const npcPositions = parseNPCPositions(fullResponse);
      
      // Parse character moods for VN portraits
      const characterMoods = parseCharacterMoods(fullResponse);
      
      // Strip CHARACTER, NPC_POSITION, and MOOD tags from visible content (they're indexed, not displayed)
      let cleanedResponse = stripCharacterTags(fullResponse);
      cleanedResponse = stripPositionTags(cleanedResponse);
      cleanedResponse = stripMoodTags(cleanedResponse);
      
      // Text complete - send cleaned content (no image generation - canvas is primary visual)
      res.write(`data: ${JSON.stringify({ fullContent: cleanedResponse, textDone: true })}\n\n`);
      
      // Start with existing NPCs from database
      let allNPCDescriptions = (gameState?.npcDescriptions as Record<string, string>) || {};
      
      if (Object.keys(newNPCs).length > 0) {
        // Merge new NPCs with existing ones
        allNPCDescriptions = { ...allNPCDescriptions, ...newNPCs };
        // Save to database for future turns
        await storage.updateGameState(conversationId, { npcDescriptions: allNPCDescriptions });
        console.log(`[NPC] Stored ${Object.keys(newNPCs).length} new character descriptions: ${Object.keys(newNPCs).join(', ')}`);
        
        // Generate sprites for new NPCs in background (fire-and-forget)
        for (const [npcName, npcDescription] of Object.entries(newNPCs)) {
          spriteService.getOrCreateSprite(npcName, npcDescription, { isProtagonist: false, isCanon: false })
            .then((spriteUrl: string) => console.log(`[NPC Sprite] Generated sprite for ${npcName}: ${spriteUrl}`))
            .catch((err: Error) => console.error(`[NPC Sprite] Failed to generate sprite for ${npcName}:`, err));
        }
      }
      
      // Store NPC positions for game canvas (ALWAYS replace - clears stale positions when no tags present)
      await storage.updateGameState(conversationId, { npcPositions });
      if (Object.keys(npcPositions).length > 0) {
        console.log(`[Canvas] Stored ${Object.keys(npcPositions).length} NPC positions for scene`);
      } else {
        console.log(`[Canvas] Cleared NPC positions (no positions in this scene)`);
      }
      
      // Store character moods for VN portraits (ALWAYS replace)
      await storage.updateGameState(conversationId, { characterMoods });
      if (Object.keys(characterMoods).length > 0) {
        console.log(`[VN] Stored ${Object.keys(characterMoods).length} character moods for scene`);
      }

      // Save assistant message (no image embedding - canvas is the primary visual)
      await chatStorage.createMessage(conversationId, "assistant", cleanedResponse);

      // Parse and apply state changes from AI response
      const stateChanges = parseStateChanges(fullResponse);
      if (stateChanges.hasChanges && gameState) {
        const currentInventory = (gameState.inventory as string[]) || [];
        const currentSpells = (gameState.spells as string[]) || [];
        const currentHealth = gameState.health ?? 100;
        const currentLocation = gameState.location || "Unknown";

        // Apply inventory changes (validate item names)
        let newInventory = [...currentInventory];
        for (const item of stateChanges.itemsAdded) {
          const cleanItem = item.trim();
          // Validate: non-empty, reasonable length, not already in inventory
          if (cleanItem.length > 0 && cleanItem.length <= 100 && !newInventory.includes(cleanItem)) {
            newInventory.push(cleanItem);
            console.log(`[State] Added item: ${cleanItem}`);
          }
        }
        for (const item of stateChanges.itemsRemoved) {
          const cleanItem = item.trim();
          if (cleanItem.length > 0) {
            newInventory = newInventory.filter(i => i.toLowerCase() !== cleanItem.toLowerCase());
            console.log(`[State] Removed item: ${cleanItem}`);
          }
        }

        // Apply spell changes (validate spell names)
        let newSpells = [...currentSpells];
        for (const spell of stateChanges.spellsLearned) {
          const cleanSpell = spell.trim();
          // Validate: non-empty, reasonable length, not already known
          if (cleanSpell.length > 0 && cleanSpell.length <= 50 && !newSpells.includes(cleanSpell)) {
            newSpells.push(cleanSpell);
            console.log(`[State] Learned new spell: ${cleanSpell}`);
          }
        }

        // Apply health changes (already clamped to 0-100)
        let newHealth = currentHealth + stateChanges.healthChange;
        newHealth = Math.max(0, Math.min(100, newHealth));
        if (stateChanges.healthChange !== 0) {
          console.log(`[State] Health changed by ${stateChanges.healthChange}: ${currentHealth} -> ${newHealth}`);
        }

        // Apply location change (validate location name)
        let newLocation = currentLocation;
        let locationActuallyChanged = false;
        if (stateChanges.newLocation) {
          const cleanLocation = stateChanges.newLocation.trim();
          if (cleanLocation.length > 0 && cleanLocation.length <= 100 && cleanLocation !== currentLocation) {
            newLocation = cleanLocation;
            locationActuallyChanged = true;
            console.log(`[State] Location changed: ${currentLocation} -> ${newLocation}`);
          }
        }

        // Update game state
        await storage.updateGameState(conversationId, {
          inventory: newInventory,
          spells: newSpells,
          health: newHealth,
          location: newLocation
        });

        console.log(`[State] Updated: health=${newHealth}, inventory=${newInventory.length} items, spells=${newSpells.length}, location=${newLocation}`);
        
        // Send state update to client
        res.write(`data: ${JSON.stringify({ 
          stateUpdate: {
            health: newHealth,
            inventory: newInventory,
            spells: newSpells,
            location: newLocation
          }
        })}\n\n`);

        // Trigger map pre-generation only when location actually changed
        if (locationActuallyChanged) {
          try {
            const mapResult = await mapService.getOrCreateMap(newLocation);
            console.log(`[Map] Pre-generated map for "${newLocation}" - status: ${mapResult.generationStatus}`);
          } catch (mapErr) {
            console.error(`[Map] Failed to pre-generate map for "${newLocation}":`, mapErr);
          }
        }
      }

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

  // NEW: Coordinated message endpoint - buffers everything before revealing
  app.post("/api/conversations/:id/coordinated", async (req: Request, res: Response) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const rateCheck = checkRateLimit(clientIp);
      if (!rateCheck.allowed) {
        res.setHeader('Retry-After', rateCheck.retryAfter || 60);
        return res.status(429).json({ error: "Too many requests. Please slow down." });
      }

      const conversationId = parseInt(req.params.id);
      
      const sessionToken = extractSessionToken(req);
      if (!sessionToken) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const isValid = await chatStorage.validateSessionToken(conversationId, sessionToken);
      if (!isValid) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { content } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: "Message content is required" });
      }
      
      const trimmedContent = content.trim();
      if (trimmedContent.length === 0) {
        return res.status(400).json({ error: "Message cannot be empty" });
      }
      
      const MAX_MESSAGE_LENGTH = 500;
      if (trimmedContent.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` });
      }

      console.log(`[Coordinated] Received message for conversation ${conversationId}`);

      await chatStorage.createMessage(conversationId, "user", trimmedContent);

      const gameState = await storage.getGameState(conversationId);
      const storyArc = gameState?.storyArc as StoryArc | undefined;
      const currentDecisionCount = (gameState?.decisionCount || 0) + 1;
      const storySummary = gameState?.storySummary || null;
      const lastSummarizedAt = gameState?.lastSummarizedAt || 0;
      const npcDescriptions = (gameState?.npcDescriptions as Record<string, string>) || {};

      await storage.updateGameState(conversationId, { decisionCount: currentDecisionCount });

      const messages = await chatStorage.getMessagesByConversation(conversationId);
      
      let chatMessages: { role: "user" | "assistant" | "system"; content: string }[];
      
      if (storyArc) {
        const rawMessages = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));
        
        const systemMessage = messages.find(m => m.role === "system");
        const systemPrompt = systemMessage?.content || "";
        
        chatMessages = buildContextWithSummary(
          systemPrompt,
          storySummary,
          storyArc,
          rawMessages.filter(m => m.role !== "system")
        );
      } else {
        chatMessages = messages.map((m) => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        }));
      }

      const pipelineContext: PipelineContext = {
        conversationId,
        gameState: gameState || null,
        storyArc: storyArc || null,
        chatMessages,
        npcDescriptions,
      };

      try {
        const result = await runCoordinatedPipeline(pipelineContext);

        await chatStorage.createMessage(conversationId, "assistant", result.scene.cleanedText);

        if (result.scene.stateChanges) {
          const changes = result.scene.stateChanges;
          const currentInventory = (gameState?.inventory as string[]) || [];
          const currentSpells = (gameState?.spells as string[]) || [];
          const currentHealth = gameState?.health ?? 100;

          let newInventory = [...currentInventory];
          for (const item of changes.itemsAdded) {
            if (!newInventory.includes(item)) newInventory.push(item);
          }
          for (const item of changes.itemsRemoved) {
            newInventory = newInventory.filter(i => i !== item);
          }

          let newSpells = [...currentSpells];
          for (const spell of changes.spellsLearned || []) {
            if (!newSpells.includes(spell)) newSpells.push(spell);
          }

          const newHealth = Math.max(0, Math.min(100, currentHealth + changes.healthChange));
          const newLocation = changes.newLocation || result.scene.location;

          await storage.updateGameState(conversationId, {
            inventory: newInventory,
            spells: newSpells,
            health: newHealth,
            location: newLocation,
            gameTime: result.scene.time || gameState?.gameTime,
            characterMoods: result.scene.characters.reduce((acc, c) => {
              acc[c.name] = c.expression;
              return acc;
            }, {} as Record<string, string>),
          });
        }

        if (storyArc && shouldSummarize(currentDecisionCount, lastSummarizedAt)) {
          const allMessages = await chatStorage.getMessagesByConversation(conversationId);
          const rawMessages = allMessages.map(m => ({ role: m.role, content: m.content }));
          const newSummary = await summarizeStory(rawMessages, storyArc, storySummary);
          await storage.updateGameState(conversationId, {
            storySummary: newSummary,
            lastSummarizedAt: currentDecisionCount
          });

          const progressContext = `STORY SUMMARY:\n${newSummary}\n\nLATEST EVENTS:\n${result.scene.narrativeText}`;
          const { shouldAdvance, updatedArc } = await checkChapterProgress(storyArc, progressContext);
          if (shouldAdvance) {
            await storage.updateGameState(conversationId, { storyArc: updatedArc });
          }
        }

        res.json({
          success: true,
          scene: result.scene,
          ttsAudioUrl: result.ttsAudioUrl,
          storyProgress: storyArc ? {
            chapter: storyArc.chapters[storyArc.currentChapterIndex]?.title,
            chapterIndex: storyArc.currentChapterIndex + 1,
            totalChapters: storyArc.chapters.length,
            decisionCount: currentDecisionCount,
          } : null,
          generationTimeMs: result.generationTimeMs,
        });

      } catch (pipelineError: any) {
        console.error("[Coordinated] Pipeline error:", pipelineError);
        
        const allMsgs = await chatStorage.getMessagesByConversation(conversationId);
        const lastUserMsg = allMsgs.filter(m => m.role === "user").pop();
        if (lastUserMsg) {
          await chatStorage.deleteMessage(lastUserMsg.id);
        }
        await storage.updateGameState(conversationId, { decisionCount: currentDecisionCount - 1 });
        
        res.status(500).json({
          success: false,
          error: "The story enchantment fizzled! The magical narrator seems to have wandered off momentarily.",
          canRetry: true,
        });
      }

    } catch (error) {
      console.error("Error in coordinated endpoint:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });
}

