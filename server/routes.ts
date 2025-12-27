import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerChatRoutes } from "./replit_integrations/chat/routes";
import { registerImageRoutes } from "./replit_integrations/image/routes";
import { registerTTSRoutes } from "./replit_integrations/tts/routes";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerGameAssetRoutes, SpriteGenerationService } from "./replit_integrations/game_assets";
import { translatorService } from "./replit_integrations/translator";
import { api } from "@shared/routes";
import { z } from "zod";
import { db } from "./db";
import { background_scenes, character_portraits } from "@shared/schema";
import OpenAI from "openai";

const spriteService = new SpriteGenerationService();

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

    // Sanitize player name to prevent prompt injection
    const sanitizedName = playerName.replace(/[^\w\s'-]/g, '').slice(0, 50);

    const prompt = `Generate a detailed visual description of a third-year Hogwarts student (age 13) named ${sanitizedName}${house ? ` in House ${house}` : ''} for consistent illustration purposes. 

Include SPECIFIC details about:
- Hair: color, length, texture, style
- Eyes: color, shape, expression
- Skin: tone, any distinctive features like freckles
- Face: shape, notable features
- Build: height, body type for a 13-year-old (taller than first-years, starting to mature)
- Clothing: ${house ? `Well-worn but cared-for Hogwarts robes with ${houseColors[house]} ${house} trim, showing two years of use` : 'familiar black Hogwarts robes'}
- Posture and demeanor: confident, comfortable at Hogwarts, no longer wide-eyed and nervous
- Any distinctive accessories or items they might have acquired over two years

Write it as a single paragraph, approximately 80-100 words, in third person, suitable for an illustrator to recreate consistently across multiple scenes. Start directly with the description, no preamble.`;

    const response = await openai.chat.completions.create({
      model: process.env.OLLAMA_MODEL || "qwen3-coder:30b",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    });

    return response.choices[0]?.message?.content?.trim() || `A confident third-year student named ${playerName} with slightly tousled hair, keen observant eyes, and an easy smile. Standing taller now after two years of growth, wearing well-worn Hogwarts robes${house ? ` with ${houseColors[house]} ${house} trim` : ''} that show comfortable familiarity.`;
  } catch (error) {
    console.error("Error generating character description:", error);
    return `A confident third-year student named ${playerName} with slightly tousled hair, keen observant eyes, and an easy smile. Standing taller now after two years of growth, wearing familiar Hogwarts robes.`;
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
  registerObjectStorageRoutes(app);
  registerGameAssetRoutes(app);

  // ===== SERVICE HEALTH CHECK ENDPOINTS =====
  
  // Check Ollama/Story AI service health
  app.get("/api/health/story-ai", async (req, res) => {
    const startTime = Date.now();
    try {
      const baseURL = process.env.OLLAMA_BASE_URL || "https://gpt.netsuite.tech/v1";
      const model = process.env.OLLAMA_MODEL || "qwen3-coder:30b";
      
      const response = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: "Say 'OK' in one word." }],
        max_tokens: 5,
      });
      
      const latency = Date.now() - startTime;
      const content = response.choices[0]?.message?.content?.trim() || "";
      
      res.json({
        service: "story-ai",
        status: "healthy",
        latency,
        details: {
          baseURL,
          model,
          response: content.substring(0, 20),
          hasApiKey: !!process.env.OLLAMA_API_KEY
        }
      });
    } catch (error: any) {
      const latency = Date.now() - startTime;
      res.status(503).json({
        service: "story-ai",
        status: "unhealthy",
        latency,
        error: error.message,
        details: {
          baseURL: process.env.OLLAMA_BASE_URL || "https://gpt.netsuite.tech/v1",
          hasApiKey: !!process.env.OLLAMA_API_KEY
        }
      });
    }
  });

  // Check xAI Image generation service health
  app.get("/api/health/image-ai", async (req, res) => {
    const startTime = Date.now();
    try {
      const hasReplitKey = !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1";
      
      // Just check configuration without making an expensive image request
      res.json({
        service: "image-ai",
        status: (hasReplitKey || hasOpenAIKey) ? "configured" : "not_configured",
        latency: Date.now() - startTime,
        details: {
          hasReplitIntegrationKey: hasReplitKey,
          hasOpenAIKey,
          baseURL,
          model: "gpt-image-1",
          note: "Image generation is expensive; check configuration only"
        }
      });
    } catch (error: any) {
      res.status(503).json({
        service: "image-ai",
        status: "error",
        latency: Date.now() - startTime,
        error: error.message
      });
    }
  });

  // Check xAI TTS service health
  app.get("/api/health/tts", async (req, res) => {
    const startTime = Date.now();
    try {
      const hasApiKey = !!process.env.XAI_API_KEY;
      
      res.json({
        service: "tts",
        status: hasApiKey ? "configured" : "not_configured",
        latency: Date.now() - startTime,
        details: {
          hasXaiApiKey: hasApiKey,
          endpoint: "wss://api.x.ai/v1/realtime",
          voice: "Ara",
          note: "TTS uses WebSocket; configuration check only"
        }
      });
    } catch (error: any) {
      res.status(503).json({
        service: "tts",
        status: "error",
        latency: Date.now() - startTime,
        error: error.message
      });
    }
  });

  // Combined health check for all services
  app.get("/api/health", async (req, res) => {
    const startTime = Date.now();
    const services: Record<string, any> = {};
    
    // Check Story AI (Ollama)
    try {
      const response = await openai.chat.completions.create({
        model: process.env.OLLAMA_MODEL || "qwen3-coder:30b",
        messages: [{ role: "user", content: "Say 'OK' in one word." }],
        max_tokens: 5,
      });
      services.storyAi = {
        status: "healthy",
        model: process.env.OLLAMA_MODEL || "qwen3-coder:30b"
      };
    } catch (error: any) {
      services.storyAi = { status: "unhealthy", error: error.message };
    }
    
    // Check Image AI configuration
    services.imageAi = {
      status: (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY) ? "configured" : "not_configured"
    };
    
    // Check TTS configuration
    services.tts = {
      status: process.env.XAI_API_KEY ? "configured" : "not_configured"
    };
    
    // Check database
    try {
      const companions = await storage.getAllCompanions();
      services.database = { status: "healthy", tableCheck: "companions", count: companions.length };
    } catch (error: any) {
      services.database = { status: "unhealthy", error: error.message };
    }
    
    const allHealthy = services.storyAi?.status === "healthy" &&
                       services.database?.status === "healthy";
    
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? "healthy" : "degraded",
      latency: Date.now() - startTime,
      services,
      timestamp: new Date().toISOString()
    });
  });

  // ===== TRANSLATION PIPELINE TEST ENDPOINT =====
  
  // Test the translation pipeline with sample narratives
  app.post("/api/test/translation-pipeline", async (req, res) => {
    const startTime = Date.now();
    try {
      const { narrative, previousContext } = req.body;
      
      // Use provided narrative or a default test narrative
      const testNarrative = narrative || `The Undercroft is dark tonight. Flickering torchlight casts long shadows across the ancient stone walls. You see Professor Snape standing near the far wall, his expression unreadable. To your left, Draco Malfoy watches with barely concealed curiosity.

"The first trial begins," Snape says, his voice barely above a whisper. "You must prove your ability to keep secrets."

What do you do?
1. [Remain silent and observe]
2. [Ask what the trial involves]
3. [Cast Lumos to see better]
4. [Step back toward the exit]`;

      console.log(`[Test] Running translation pipeline test (${testNarrative.length} chars)`);
      
      const scenePayload = await translatorService.extractSceneData(
        testNarrative,
        previousContext || {}
      );
      
      const latency = Date.now() - startTime;
      
      res.json({
        success: true,
        latency,
        input: {
          narrativeLength: testNarrative.length,
          hadPreviousContext: !!previousContext
        },
        output: scenePayload,
        validation: {
          hasLocation: !!scenePayload.location,
          hasAmbiance: !!scenePayload.ambiance,
          characterCount: scenePayload.characters?.length || 0,
          choiceCount: scenePayload.choices?.length || 0,
          hasNarratorMood: !!scenePayload.narratorMood,
          confidence: scenePayload.confidence || 0
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        latency: Date.now() - startTime,
        error: error.message
      });
    }
  });

  // ===== ASSET GENERATION TEST ENDPOINT =====
  
  app.get("/api/test/asset-generation", async (req, res) => {
    const startTime = Date.now();
    const results: Record<string, { status: string; cached?: boolean; latency?: number; error?: string }> = {};
    
    try {
      // Test 1: Check sprite status/caching
      const spriteStatusStart = Date.now();
      const allSprites = await storage.getAllCharacterSprites();
      results.spriteCache = {
        status: "ok",
        cached: allSprites.length > 0,
        latency: Date.now() - spriteStatusStart
      };
      
      // Test 2: Check map status/caching
      const mapStatusStart = Date.now();
      const allMaps = await storage.getAllLocationMaps();
      results.mapCache = {
        status: "ok",
        cached: allMaps.length > 0,
        latency: Date.now() - mapStatusStart
      };
      
      // Test 3: Check background cache (using db directly)
      const bgStatusStart = Date.now();
      const allBackgrounds = await db.select().from(background_scenes);
      results.backgroundCache = {
        status: "ok",
        cached: allBackgrounds.length > 0,
        latency: Date.now() - bgStatusStart
      };
      
      // Test 4: Check portrait cache (using db directly)
      const portraitStatusStart = Date.now();
      const allPortraits = await db.select().from(character_portraits);
      results.portraitCache = {
        status: "ok", 
        cached: allPortraits.length > 0,
        latency: Date.now() - portraitStatusStart
      };
      
      // Test 5: Validate a specific known map can be retrieved
      const mapFetchStart = Date.now();
      const testMap = await storage.getLocationMap("Great Hall");
      results.mapRetrieval = {
        status: testMap ? "ok" : "not_found",
        cached: !!testMap,
        latency: Date.now() - mapFetchStart
      };
      
      const totalLatency = Date.now() - startTime;
      const allPassing = Object.values(results).every(r => r.status === "ok");
      
      res.status(allPassing ? 200 : 503).json({
        success: allPassing,
        totalLatency,
        cacheStats: {
          sprites: allSprites.length,
          maps: allMaps.length,
          backgrounds: allBackgrounds.length,
          portraits: allPortraits.length
        },
        tests: results,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        latency: Date.now() - startTime,
        error: error.message,
        tests: results
      });
    }
  });

  // ===== NEW EXPLORATION-FOCUSED GAME START =====
  // Creates player_profile and returns brief intro - no conversation loop
  app.post(api.game.start.path, async (req, res) => {
    try {
      const { playerName, house } = api.game.start.input.parse(req.body);

      // 1. Create conversation (for session tracking)
      const conversation = await chatStorage.createConversation(`Exploration: ${playerName}`);

      // 2. Generate brief intro text (2-3 sentences, not a conversation)
      const { generateGameIntro } = await import("./explorationAI");
      const { introText, startingLocation } = await generateGameIntro(playerName, house);

      // 3. Create player profile with RPG stats
      const startingSpells = [
        "Lumos", "Nox", "Wingardium Leviosa", "Alohomora", 
        "Reparo", "Incendio", "Flipendo", "Expelliarmus"
      ];
      
      const profile = await storage.createPlayerProfile({
        conversationId: conversation.id,
        playerName,
        house,
        level: 1,
        experience: 0,
        experienceToNext: 100,
        galleons: 50,
        stats: {
          maxHp: 100,
          currentHp: 100,
          attack: 10,
          defense: 10,
          speed: 10,
          accuracy: 90,
          evasion: 5,
          critChance: 5,
        },
        knownSpells: startingSpells,
        equippedSpells: startingSpells.slice(0, 4), // First 4 as equipped
        currentLocation: startingLocation,
        trialSigils: 0,
        playTime: 0,
        battlesWon: 0,
        creaturesDefeated: 0,
      });

      // 4. Generate character description in background (for sprites)
      generateCharacterDescription(playerName, house)
        .then(async (charDesc) => {
          const sessionSpriteKey = `explore_${profile.id}_${playerName}`;
          spriteService.getOrCreateSprite(sessionSpriteKey, charDesc, { isProtagonist: true })
            .then((url: string) => console.log(`Generated explore sprite for ${playerName}: ${url}`))
            .catch((err: Error) => console.error(`Sprite generation failed:`, err));
        })
        .catch(console.error);

      res.status(201).json({
        profileId: profile.id,
        introText,
        startingLocation,
        playerData: {
          playerName: profile.playerName,
          house: profile.house || house,
          level: profile.level || 1,
          stats: {
            maxHp: (profile.stats as any)?.maxHp || 100,
            currentHp: (profile.stats as any)?.currentHp || 100,
          },
          equippedSpells: profile.equippedSpells || startingSpells.slice(0, 4),
          currentLocation: profile.currentLocation || startingLocation,
        },
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

  // Visual novel route removed - game now uses exploration mode only (/api/game/start)

  // Get Game State
  app.get(api.game.getState.path, async (req, res) => {
    // Validate conversationId is a positive integer
    const conversationIdRaw = req.params.conversationId;
    const conversationId = Number(conversationIdRaw);
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ message: "Invalid conversation ID" });
    }

    // Session token validation for authorization
    const sessionToken = req.headers['x-session-token'] as string;
    if (!sessionToken) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const isValid = await chatStorage.validateSessionToken(conversationId, sessionToken);
    if (!isValid) {
      return res.status(403).json({ message: "Access denied" });
    }

    const state = await storage.getGameState(conversationId);

    if (!state) {
      return res.status(404).json({ message: "Game state not found" });
    }

    // Fetch sprite URLs for NPCs in current scene positions
    const npcPositions = (state.npcPositions as Record<string, string>) ?? {};
    const npcSpriteUrls: Record<string, string> = {};
    for (const npcName of Object.keys(npcPositions)) {
      const sprite = await storage.getCharacterSprite(npcName);
      if (sprite?.spriteSheetUrl) {
        npcSpriteUrls[npcName] = sprite.spriteSheetUrl;
      }
    }

    // Use session-scoped player sprite URL directly from game_state
    res.json({
      playerName: state.playerName,
      house: state.house,
      health: state.health ?? 100,
      inventory: (state.inventory as string[]) ?? [],
      spells: (state.spells as string[]) ?? [],
      location: state.location ?? "Unknown",
      gameTime: state.gameTime ?? "Unknown",
      characterDescription: state.characterDescription ?? null,
      storyArc: state.storyArc ?? null,
      npcDescriptions: state.npcDescriptions ?? null,
      npcPositions: npcPositions,
      characterMoods: (state.characterMoods as Record<string, string>) ?? {},
      npcSpriteUrls: npcSpriteUrls,
      playerSpriteUrl: state.playerSpriteUrl ?? null,
      playerSpriteGenerated: state.playerSpriteGenerated ?? false,
      decisionCount: state.decisionCount ?? 0,
    });
  });

  // Get Player Profile (for exploration mode)
  app.get("/api/game/profile/:profileId", async (req, res) => {
    const profileId = Number(req.params.profileId);
    if (!Number.isInteger(profileId) || profileId <= 0) {
      return res.status(400).json({ message: "Invalid profile ID" });
    }

    const profile = await storage.getPlayerProfileById(profileId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    const stats = profile.stats as any || {
      maxHp: 100, currentHp: 100, attack: 10, defense: 10,
      speed: 10, accuracy: 90, evasion: 5, critChance: 5,
    };

    res.json({
      id: profile.id,
      playerName: profile.playerName,
      house: profile.house,
      level: profile.level || 1,
      experience: profile.experience || 0,
      experienceToNext: profile.experienceToNext || 100,
      galleons: profile.galleons || 50,
      stats,
      knownSpells: profile.knownSpells || [],
      equippedSpells: profile.equippedSpells || [],
      currentLocation: profile.currentLocation || "Great Hall",
      trialSigils: profile.trialSigils || 0,
      battlesWon: profile.battlesWon || 0,
    });
  });

  // Update Player Location (for map transitions)
  app.patch("/api/game/profile/:profileId/location", async (req, res) => {
    const profileId = Number(req.params.profileId);
    if (!Number.isInteger(profileId) || profileId <= 0) {
      return res.status(400).json({ message: "Invalid profile ID" });
    }

    const { location } = req.body;
    if (!location || typeof location !== "string") {
      return res.status(400).json({ message: "Location is required" });
    }

    const profile = await storage.getPlayerProfileById(profileId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    await storage.updatePlayerProfile(profileId, { currentLocation: location });
    res.json({ success: true, location });
  });

  // ===== RPG SYSTEM ROUTES =====
  
  // Seed RPG data (admin only)
  app.post("/api/rpg/seed", async (req, res) => {
    try {
      const { seedRPGData } = await import("./seed-rpg-data");
      await seedRPGData();
      res.json({ success: true, message: "RPG data seeded successfully" });
    } catch (error: any) {
      console.error("Error seeding RPG data:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });
  
  // Seed combat assets (spells, creatures, items, companions, backgrounds)
  app.post("/api/rpg/seed-combat", async (req, res) => {
    try {
      const { seedCombatAssets } = await import("./seed-combat-assets");
      const results = await seedCombatAssets();
      res.json({ 
        success: true, 
        message: "Combat assets seeded successfully",
        seeded: results
      });
    } catch (error: any) {
      console.error("Error seeding combat assets:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });
  
  // Preload combat assets - generate battle backgrounds via xAI
  app.post("/api/rpg/preload-assets", async (req, res) => {
    try {
      const { battleBackgroundService } = await import("./replit_integrations/game_assets");
      const { concurrency = 2 } = req.body || {};
      
      // Generate pending battle backgrounds
      const bgResults = await battleBackgroundService.pregenerateAll(concurrency);
      
      res.json({
        success: true,
        message: "Asset preloading initiated",
        battleBackgrounds: bgResults,
      });
    } catch (error: any) {
      console.error("Error preloading assets:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });
  
  // Get all battle backgrounds
  app.get("/api/rpg/battle-backgrounds", async (req, res) => {
    try {
      const { battleBackgroundService } = await import("./replit_integrations/game_assets");
      const backgrounds = await battleBackgroundService.getAllBackgrounds();
      res.json(backgrounds);
    } catch (error: any) {
      console.error("Error fetching battle backgrounds:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get battle background for a location
  app.get("/api/rpg/battle-backgrounds/:location", async (req, res) => {
    try {
      const { battleBackgroundService } = await import("./replit_integrations/game_assets");
      const timeOfDay = (req.query.time as string) || "day";
      const bg = await battleBackgroundService.getBackgroundForLocation(req.params.location, timeOfDay);
      
      if (!bg) {
        return res.status(404).json({ message: "No battle background found for this location" });
      }
      res.json(bg);
    } catch (error: any) {
      console.error("Error fetching battle background:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get all combat spells
  app.get("/api/rpg/spells", async (req, res) => {
    try {
      const spells = await storage.getAllCombatSpells();
      res.json(spells);
    } catch (error: any) {
      console.error("Error fetching spells:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get a specific combat spell
  app.get("/api/rpg/spells/:spellName", async (req, res) => {
    try {
      const spell = await storage.getCombatSpell(req.params.spellName);
      if (!spell) {
        return res.status(404).json({ message: "Spell not found" });
      }
      res.json(spell);
    } catch (error: any) {
      console.error("Error fetching spell:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get all items
  app.get("/api/rpg/items", async (req, res) => {
    try {
      const items = await storage.getAllItems();
      res.json(items);
    } catch (error: any) {
      console.error("Error fetching items:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get a specific item
  app.get("/api/rpg/items/:itemId", async (req, res) => {
    try {
      const item = await storage.getItem(req.params.itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      res.json(item);
    } catch (error: any) {
      console.error("Error fetching item:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get all companions
  app.get("/api/rpg/companions", async (req, res) => {
    try {
      const companions = await storage.getAllCompanions();
      res.json(companions);
    } catch (error: any) {
      console.error("Error fetching companions:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get all quests
  app.get("/api/rpg/quests", async (req, res) => {
    try {
      const quests = await storage.getAllQuests();
      res.json(quests);
    } catch (error: any) {
      console.error("Error fetching quests:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get map connections for a location
  app.get("/api/rpg/map-connections/:location", async (req, res) => {
    try {
      const connections = await storage.getMapConnections(req.params.location);
      res.json(connections);
    } catch (error: any) {
      console.error("Error fetching map connections:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get all map connections
  app.get("/api/rpg/map-connections", async (req, res) => {
    try {
      const connections = await storage.getAllMapConnections();
      res.json(connections);
    } catch (error: any) {
      console.error("Error fetching all map connections:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Map cohesion validation - checks bidirectional connections and spawn positions
  app.get("/api/rpg/validate-map-cohesion", async (req, res) => {
    try {
      const connections = await storage.getAllMapConnections();
      const issues: Array<{ type: string; severity: string; message: string; details?: any }> = [];
      
      // Build lookup maps
      const connectionMap = new Map<string, typeof connections[0][]>();
      const allLocations = new Set<string>();
      
      for (const conn of connections) {
        allLocations.add(conn.fromLocation);
        allLocations.add(conn.toLocation);
        const key = conn.fromLocation;
        if (!connectionMap.has(key)) {
          connectionMap.set(key, []);
        }
        connectionMap.get(key)!.push(conn);
      }
      
      // Check 1: Bidirectional connections (skip one-way)
      for (const conn of connections) {
        if (conn.isOneWay) continue;
        
        const reverseConnections = connectionMap.get(conn.toLocation) || [];
        const hasReverse = reverseConnections.some(rc => rc.toLocation === conn.fromLocation);
        
        if (!hasReverse) {
          issues.push({
            type: "missing_bidirectional",
            severity: "error",
            message: `Missing reverse connection: ${conn.toLocation} → ${conn.fromLocation}`,
            details: { from: conn.fromLocation, to: conn.toLocation, connectionId: conn.id }
          });
        }
      }
      
      // Check 2: Spawn positions should be offset from exits (>40px)
      const MIN_SPAWN_OFFSET = 40;
      for (const conn of connections) {
        if (!conn.toPosition || !conn.fromPosition) continue;
        
        const reverseConnections = connectionMap.get(conn.toLocation) || [];
        const reverseConn = reverseConnections.find(rc => rc.toLocation === conn.fromLocation);
        
        if (reverseConn && reverseConn.fromPosition) {
          const spawnPos = conn.toPosition;
          const exitPos = reverseConn.fromPosition;
          const distance = Math.sqrt(
            Math.pow(spawnPos.x - exitPos.x, 2) + Math.pow(spawnPos.y - exitPos.y, 2)
          );
          
          if (distance < MIN_SPAWN_OFFSET) {
            issues.push({
              type: "spawn_too_close_to_exit",
              severity: "warning",
              message: `Spawn at ${conn.toLocation} is only ${distance.toFixed(0)}px from exit (min: ${MIN_SPAWN_OFFSET}px)`,
              details: { 
                location: conn.toLocation, 
                spawnPos, 
                exitPos, 
                distance: Math.round(distance) 
              }
            });
          }
        }
      }
      
      // Check 3: Positions within reasonable bounds (640x480 default map size)
      const MAX_X = 640;
      const MAX_Y = 480;
      for (const conn of connections) {
        if (conn.fromPosition) {
          if (conn.fromPosition.x < 0 || conn.fromPosition.x > MAX_X ||
              conn.fromPosition.y < 0 || conn.fromPosition.y > MAX_Y) {
            issues.push({
              type: "exit_out_of_bounds",
              severity: "error",
              message: `Exit position out of bounds at ${conn.fromLocation}`,
              details: { location: conn.fromLocation, position: conn.fromPosition }
            });
          }
        }
        if (conn.toPosition) {
          if (conn.toPosition.x < 0 || conn.toPosition.x > MAX_X ||
              conn.toPosition.y < 0 || conn.toPosition.y > MAX_Y) {
            issues.push({
              type: "spawn_out_of_bounds",
              severity: "error",
              message: `Spawn position out of bounds at ${conn.toLocation}`,
              details: { location: conn.toLocation, position: conn.toPosition }
            });
          }
        }
      }
      
      const errorCount = issues.filter(i => i.severity === "error").length;
      const warningCount = issues.filter(i => i.severity === "warning").length;
      
      res.json({
        valid: errorCount === 0,
        totalConnections: connections.length,
        uniqueLocations: allLocations.size,
        issues,
        summary: {
          errors: errorCount,
          warnings: warningCount,
          passed: errorCount === 0 ? "Map cohesion valid" : "Map cohesion has issues"
        }
      });
    } catch (error: any) {
      console.error("Error validating map cohesion:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Analyze map cohesion issues - ONLY adds missing reverse connections (no deletions)
  app.post("/api/rpg/fix-map-cohesion", async (req, res) => {
    try {
      const { dryRun = true, addReverseOnly = true } = req.body || {};
      const connections = await storage.getAllMapConnections();
      const analysis: {
        potentialDuplicates: Array<{ ids: number[]; fromTo: string; details: string }>;
        missingReverse: Array<{ from: string; to: string; canAutoFix: boolean; reason?: string }>;
      } = { potentialDuplicates: [], missingReverse: [] };
      
      // Build connection map for analysis
      const connectionMap = new Map<string, typeof connections[0][]>();
      const pairGroups = new Map<string, typeof connections[0][]>();
      
      for (const conn of connections) {
        // Group by from/to pair
        const pairKey = `${conn.fromLocation}|${conn.toLocation}`;
        if (!pairGroups.has(pairKey)) {
          pairGroups.set(pairKey, []);
        }
        pairGroups.get(pairKey)!.push(conn);
        
        // Build reverse lookup
        if (!connectionMap.has(conn.fromLocation)) {
          connectionMap.set(conn.fromLocation, []);
        }
        connectionMap.get(conn.fromLocation)!.push(conn);
      }
      
      // Identify potential duplicates (same from/to) for REVIEW ONLY
      for (const [pairKey, conns] of pairGroups) {
        if (conns.length > 1) {
          analysis.potentialDuplicates.push({
            ids: conns.map(c => c.id),
            fromTo: pairKey,
            details: `${conns.length} connections between same locations - review manually if intentional parallel exits`
          });
        }
      }
      
      // Find missing reverse connections
      const toCreate: Array<{ from: string; to: string; original: typeof connections[0] }> = [];
      
      for (const conn of connections) {
        if (conn.isOneWay) continue;
        
        const reverseConnections = connectionMap.get(conn.toLocation) || [];
        const hasReverse = reverseConnections.some(rc => rc.toLocation === conn.fromLocation);
        
        if (!hasReverse) {
          const canAutoFix = !!(conn.fromPosition && conn.toPosition);
          analysis.missingReverse.push({
            from: conn.toLocation,
            to: conn.fromLocation,
            canAutoFix,
            reason: canAutoFix ? undefined : "Missing position data - requires manual setup"
          });
          
          if (canAutoFix) {
            toCreate.push({ from: conn.toLocation, to: conn.fromLocation, original: conn });
          }
        }
      }
      
      // Dry run - report only
      if (dryRun) {
        return res.json({
          dryRun: true,
          message: "Analysis complete. Set dryRun: false to add missing reverse connections.",
          analysis,
          summary: {
            potentialDuplicatesForReview: analysis.potentialDuplicates.length,
            missingReverseTotal: analysis.missingReverse.length,
            canAutoFix: toCreate.length,
            requiresManualFix: analysis.missingReverse.filter(m => !m.canAutoFix).length,
            currentTotal: connections.length
          },
          note: "Potential duplicates are listed for manual review only - this endpoint will NOT delete any connections."
        });
      }
      
      // Apply safe fixes only (adding reverse connections)
      if (!addReverseOnly) {
        return res.status(400).json({
          error: "Only addReverseOnly=true is supported. This endpoint does not delete connections.",
          message: "Use direct database queries for deletion after manual review."
        });
      }
      
      let added = 0;
      for (const entry of toCreate) {
        const orig = entry.original;
        const reverseDirection = orig.direction === "north" ? "south" : 
                                 orig.direction === "south" ? "north" :
                                 orig.direction === "east" ? "west" :
                                 orig.direction === "west" ? "east" : "south";
        
        await storage.createMapConnection({
          fromLocation: entry.from,
          toLocation: entry.to,
          direction: reverseDirection,
          isOneWay: false,
          fromPosition: orig.toPosition,
          toPosition: orig.fromPosition,
          connectionType: orig.connectionType,
          transitionText: orig.transitionText ? `Return to ${entry.to}` : undefined,
        });
        added++;
      }
      
      // Re-validate
      const updatedConnections = await storage.getAllMapConnections();
      const updatedMap = new Map<string, Set<string>>();
      for (const conn of updatedConnections) {
        if (!updatedMap.has(conn.fromLocation)) {
          updatedMap.set(conn.fromLocation, new Set());
        }
        updatedMap.get(conn.fromLocation)!.add(conn.toLocation);
      }
      
      let remainingMissing = 0;
      for (const conn of updatedConnections) {
        if (conn.isOneWay) continue;
        const hasReverse = updatedMap.get(conn.toLocation)?.has(conn.fromLocation);
        if (!hasReverse) remainingMissing++;
      }
      
      res.json({
        dryRun: false,
        success: true,
        action: "Added missing reverse connections only (no deletions)",
        reverseConnectionsAdded: added,
        totalConnectionsNow: updatedConnections.length,
        remainingMissingReverse: remainingMissing,
        potentialDuplicatesForReview: analysis.potentialDuplicates.length,
        note: "Potential duplicates are NOT touched - review manually if needed."
      });
    } catch (error: any) {
      console.error("Error analyzing map cohesion:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get encounter table for a location
  app.get("/api/rpg/encounters/:location", async (req, res) => {
    try {
      const encounters = await storage.getEncounterTable(req.params.location);
      res.json(encounters);
    } catch (error: any) {
      console.error("Error fetching encounters:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get creature stats
  app.get("/api/rpg/creatures", async (req, res) => {
    try {
      const creatures = await storage.getAllCreatureStats();
      res.json(creatures);
    } catch (error: any) {
      console.error("Error fetching creatures:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get specific creature stats
  app.get("/api/rpg/creatures/:creatureName", async (req, res) => {
    try {
      const creature = await storage.getCreatureStats(req.params.creatureName);
      if (!creature) {
        return res.status(404).json({ message: "Creature not found" });
      }
      res.json(creature);
    } catch (error: any) {
      console.error("Error fetching creature:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ===== NPC LOCATION ROUTES =====
  
  // Get NPCs at a specific location for a player profile
  app.get("/api/rpg/npcs/:location", async (req, res) => {
    try {
      const profileId = parseInt(req.query.profileId as string);
      if (isNaN(profileId)) {
        return res.status(400).json({ message: "profileId query parameter is required" });
      }
      
      const npcs = await storage.getNpcLocations(profileId, req.params.location);
      
      // Fetch sprite data for each NPC
      const npcsWithSprites = await Promise.all(npcs.map(async (npc) => {
        const sprite = await storage.getCharacterSprite(npc.npcName);
        return {
          ...npc,
          sprite: sprite || null,
        };
      }));
      
      res.json(npcsWithSprites);
    } catch (error: any) {
      console.error("Error fetching NPCs:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get all NPCs for a player profile
  app.get("/api/rpg/npcs", async (req, res) => {
    try {
      const profileId = parseInt(req.query.profileId as string);
      if (isNaN(profileId)) {
        return res.status(400).json({ message: "profileId query parameter is required" });
      }
      
      const npcs = await storage.getNpcLocations(profileId);
      res.json(npcs);
    } catch (error: any) {
      console.error("Error fetching all NPCs:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Spawn NPCs from AI story context
  app.post("/api/rpg/npcs/spawn", async (req, res) => {
    try {
      const { profileId, location, npcs } = req.body;
      
      if (!profileId || !location || !Array.isArray(npcs)) {
        return res.status(400).json({ 
          message: "profileId, location, and npcs array are required" 
        });
      }
      
      // Standard canvas size for position calculations
      const CANVAS_WIDTH = 480;
      const CANVAS_HEIGHT = 360;
      
      const spawnedNpcs = await Promise.all(npcs.map(async (npc: { 
        name: string; 
        description?: string; 
        x?: number; 
        y?: number;
      }) => {
        // Check if sprite exists, if not queue for generation
        let sprite = await storage.getCharacterSprite(npc.name);
        
        if (!sprite && npc.description) {
          // Mark for sprite generation
          const { npcSpriteService } = await import("./replit_integrations/game_assets");
          const generatedSprite = await npcSpriteService.generateNpcSprite(npc.name, npc.description);
          sprite = generatedSprite ?? undefined;
        }
        
        // Set NPC location with spawn position in pixel coordinates
        // Default to walkable area (avoiding walls at edges)
        const npcLocation = await storage.setNpcLocation({
          profileId,
          npcName: npc.name,
          currentLocation: location,
          spawnPosition: {
            x: npc.x ?? Math.floor(Math.random() * (CANVAS_WIDTH * 0.6) + CANVAS_WIDTH * 0.2),
            y: npc.y ?? Math.floor(Math.random() * (CANVAS_HEIGHT * 0.4) + CANVAS_HEIGHT * 0.3),
          },
        });
        
        return {
          ...npcLocation,
          sprite: sprite || null,
        };
      }));
      
      res.json(spawnedNpcs);
    } catch (error: any) {
      console.error("Error spawning NPCs:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Move an NPC to a new location or position
  app.patch("/api/rpg/npcs/:npcName", async (req, res) => {
    try {
      const { profileId, location, x, y } = req.body;
      
      if (!profileId) {
        return res.status(400).json({ message: "profileId is required" });
      }
      
      const existingNpc = await storage.getNpcLocation(profileId, req.params.npcName);
      if (!existingNpc) {
        return res.status(404).json({ message: "NPC not found" });
      }
      
      const currentPos = existingNpc.spawnPosition ?? { x: 0, y: 0 };
      const updated = await storage.updateNpcLocation(existingNpc.id, {
        currentLocation: location ?? existingNpc.currentLocation,
        spawnPosition: (x !== undefined || y !== undefined) ? {
          x: x ?? currentPos.x,
          y: y ?? currentPos.y,
        } : existingNpc.spawnPosition,
      });
      
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating NPC:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get character sprite by name
  app.get("/api/rpg/sprites/:characterName", async (req, res) => {
    try {
      const sprite = await storage.getCharacterSprite(req.params.characterName);
      if (!sprite) {
        return res.status(404).json({ message: "Sprite not found" });
      }
      res.json(sprite);
    } catch (error: any) {
      console.error("Error fetching sprite:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Generate or regenerate a character sprite
  app.post("/api/rpg/sprites/generate", async (req, res) => {
    try {
      const { characterName, description, isCanon } = req.body;
      
      if (!characterName || !description) {
        return res.status(400).json({ 
          message: "characterName and description are required" 
        });
      }
      
      const { npcSpriteService } = await import("./replit_integrations/game_assets");
      const sprite = await npcSpriteService.generateNpcSprite(characterName, description, isCanon ?? false);
      
      res.json(sprite);
    } catch (error: any) {
      console.error("Error generating sprite:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ===== COMBAT ROUTES =====
  
  // Start a new battle encounter
  app.post("/api/combat/encounter", async (req, res) => {
    try {
      const { profileId, enemyType, location } = req.body;
      
      if (!profileId || !location) {
        return res.status(400).json({ message: "profileId and location are required" });
      }
      
      const existingBattle = await storage.getActiveBattleForPlayer(profileId);
      if (existingBattle) {
        const battleLogs = await storage.getBattleLogsForBattle(existingBattle.battleId);
        return res.json({
          message: "Resuming existing battle",
          battle: {
            battleId: existingBattle.battleId,
            playerState: existingBattle.playerState,
            enemyState: existingBattle.enemyState,
            companionStates: existingBattle.companionStates || [],
            turnOrder: existingBattle.currentTurnOrder || [],
            currentTurn: existingBattle.turnNumber || 1,
            phase: existingBattle.phase,
            logs: battleLogs,
            locationName: existingBattle.locationName || location,
            canFlee: existingBattle.canFlee ?? true,
          },
        });
      }
      
      const { initializeBattle } = await import("./battleEngine");
      const battleContext = await initializeBattle(profileId, enemyType || null, location);
      
      res.json({ 
        message: "Battle started!",
        battle: battleContext 
      });
    } catch (error: any) {
      console.error("Error starting encounter:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Execute a combat action (spell, item, or flee)
  app.post("/api/combat/action", async (req, res) => {
    try {
      const { battleId, actorName, actionType, actionData } = req.body;
      
      if (!battleId || !actorName || !actionType) {
        return res.status(400).json({ message: "battleId, actorName, and actionType are required" });
      }
      
      const { executeAction, executeAITurn, processTurnEnd } = await import("./battleEngine");
      
      const { battle, result } = await executeAction(battleId, actorName, {
        type: actionType,
        spellName: actionData?.spellName,
        itemId: actionData?.itemId,
      });
      
      let aiResult = null;
      let turnEndResult = null;
      
      if (!result.battleEnded && battle.phase !== "victory" && battle.phase !== "defeat" && battle.phase !== "flee") {
        const aiResponse = await executeAITurn(battleId);
        aiResult = aiResponse.result;
        
        if (!aiResponse.result.battleEnded) {
          turnEndResult = await processTurnEnd(battleId);
          
          const updatedBattle = await storage.getBattleStateByBattleId(battleId);
          if (updatedBattle) {
            battle.playerState = updatedBattle.playerState as any;
            battle.enemyState = updatedBattle.enemyState as any;
            battle.currentTurn = updatedBattle.turnNumber || battle.currentTurn + 1;
            battle.phase = updatedBattle.phase as any;
          }
        } else {
          battle.phase = aiResponse.battle.phase;
          battle.playerState = aiResponse.battle.playerState;
          battle.enemyState = aiResponse.battle.enemyState;
        }
      }
      
      res.json({
        battle,
        playerAction: result,
        enemyAction: aiResult,
        turnEnd: turnEndResult,
      });
    } catch (error: any) {
      console.error("Error executing action:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // End a battle and calculate rewards
  app.post("/api/combat/end", async (req, res) => {
    try {
      const { battleId, outcome } = req.body;
      
      if (!battleId || !outcome) {
        return res.status(400).json({ message: "battleId and outcome are required" });
      }
      
      if (!["victory", "defeat", "flee"].includes(outcome)) {
        return res.status(400).json({ message: "outcome must be 'victory', 'defeat', or 'flee'" });
      }
      
      const { endBattle } = await import("./battleEngine");
      const rewards = await endBattle(battleId, outcome);
      
      res.json({
        message: outcome === "victory" ? "Victory!" : outcome === "flee" ? "Escaped!" : "Defeated...",
        rewards,
      });
    } catch (error: any) {
      console.error("Error ending battle:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get current battle state
  app.get("/api/combat/battle/:battleId", async (req, res) => {
    try {
      const battleState = await storage.getBattleStateByBattleId(req.params.battleId);
      
      if (!battleState) {
        return res.status(404).json({ message: "Battle not found" });
      }
      
      const logs = await storage.getBattleLogsForBattle(req.params.battleId);
      
      res.json({
        battle: {
          battleId: battleState.battleId,
          playerState: battleState.playerState,
          enemyState: battleState.enemyState,
          companionStates: battleState.companionStates || [],
          turnOrder: battleState.currentTurnOrder || [],
          currentTurn: battleState.turnNumber || 1,
          phase: battleState.phase,
          logs,
          locationName: battleState.locationName,
          canFlee: battleState.canFlee,
        }
      });
    } catch (error: any) {
      console.error("Error fetching battle:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get active battle for a player
  app.get("/api/combat/active/:profileId", async (req, res) => {
    try {
      const profileId = parseInt(req.params.profileId);
      const battleState = await storage.getActiveBattleForPlayer(profileId);
      
      if (!battleState) {
        return res.json({ battle: null });
      }
      
      const logs = await storage.getBattleLogsForBattle(battleState.battleId);
      
      res.json({
        battle: {
          battleId: battleState.battleId,
          playerState: battleState.playerState,
          enemyState: battleState.enemyState,
          companionStates: battleState.companionStates || [],
          turnOrder: battleState.currentTurnOrder || [],
          currentTurn: battleState.turnNumber || 1,
          phase: battleState.phase,
          logs,
          locationName: battleState.locationName,
          canFlee: battleState.canFlee,
        },
      });
    } catch (error: any) {
      console.error("Error fetching active battle:", error);
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
