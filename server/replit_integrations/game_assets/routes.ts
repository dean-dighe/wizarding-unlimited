import type { Express } from "express";
import { SpriteGenerationService, CANON_CHARACTERS } from "./sprites";
import { MapGenerationService, HARRY_POTTER_LOCATIONS } from "./maps";
import { environmentAssetService, ENVIRONMENT_ASSETS } from "./environment";
import { storage } from "../../storage";
import pLimit from "p-limit";

export function registerGameAssetRoutes(app: Express): void {
  const spriteService = new SpriteGenerationService();
  const mapService = new MapGenerationService();

  app.get("/api/game-assets/sprite/:characterName", async (req, res) => {
    try {
      const { characterName } = req.params;
      const sprite = await storage.getCharacterSprite(decodeURIComponent(characterName));
      
      if (!sprite) {
        return res.status(404).json({ error: "Sprite not found" });
      }
      
      res.json({
        characterName: sprite.characterName,
        spriteSheetUrl: sprite.spriteSheetUrl,
        spriteWidth: sprite.spriteWidth,
        spriteHeight: sprite.spriteHeight,
        frameCount: sprite.frameCount,
        animationConfig: sprite.animationConfig,
      });
    } catch (error) {
      console.error("Error fetching sprite:", error);
      res.status(500).json({ error: "Failed to fetch sprite" });
    }
  });

  app.post("/api/game-assets/sprite/generate", async (req, res) => {
    try {
      const { characterName, characterDescription, isProtagonist, isCanon } = req.body;
      
      if (!characterName || !characterDescription) {
        return res.status(400).json({ error: "characterName and characterDescription are required" });
      }
      
      const spriteUrl = await spriteService.getOrCreateSprite(
        characterName,
        characterDescription,
        { isProtagonist, isCanon }
      );
      
      res.json({ spriteUrl });
    } catch (error) {
      console.error("Error generating sprite:", error);
      res.status(500).json({ error: "Failed to generate sprite" });
    }
  });

  app.get("/api/game-assets/sprites", async (req, res) => {
    try {
      const sprites = await storage.getAllCharacterSprites();
      res.json(sprites.map(s => ({
        characterName: s.characterName,
        spriteSheetUrl: s.spriteSheetUrl,
        isProtagonist: s.isProtagonist,
        isCanon: s.isCanon,
      })));
    } catch (error) {
      console.error("Error fetching sprites:", error);
      res.status(500).json({ error: "Failed to fetch sprites" });
    }
  });

  app.get("/api/game-assets/map/:locationName", async (req, res) => {
    try {
      const { locationName } = req.params;
      const decodedName = decodeURIComponent(locationName);
      
      const result = await mapService.getOrCreateMap(decodedName);
      
      let environmentSprites: Record<string, string> = {};
      if (result.tilemapData?.objects && result.tilemapData.objects.length > 0) {
        const assetIdSet = new Set<string>();
        result.tilemapData.objects.forEach(o => assetIdSet.add(o.assetId));
        const uniqueAssetIds = Array.from(assetIdSet);
        const sprites = await Promise.all(
          uniqueAssetIds.map(id => storage.getEnvironmentSprite(id))
        );
        sprites.forEach((sprite, i) => {
          if (sprite) {
            environmentSprites[uniqueAssetIds[i]] = sprite.spriteUrl;
          }
        });
      }
      
      res.json({
        locationName: decodedName,
        tilesetUrl: result.tilesetUrl,
        tilemapData: result.tilemapData,
        spawnPoints: result.spawnPoints,
        generationStatus: result.generationStatus,
        environmentSprites,
      });
    } catch (error) {
      console.error("Error fetching map:", error);
      res.status(500).json({ error: "Failed to fetch map" });
    }
  });

  app.post("/api/game-assets/map/generate", async (req, res) => {
    try {
      const { locationName, width, height } = req.body;
      
      if (!locationName) {
        return res.status(400).json({ error: "locationName is required" });
      }
      
      const result = await mapService.getOrCreateMap(locationName, width || 640, height || 320);
      
      res.json({
        locationName,
        tilesetUrl: result.tilesetUrl,
        tilemapData: result.tilemapData,
        spawnPoints: result.spawnPoints,
        generationStatus: result.generationStatus,
      });
    } catch (error) {
      console.error("Error generating map:", error);
      res.status(500).json({ error: "Failed to generate map" });
    }
  });

  app.get("/api/game-assets/maps", async (req, res) => {
    try {
      const maps = await storage.getAllLocationMaps();
      res.json(maps.map(m => ({
        locationName: m.locationName,
        mapWidth: m.mapWidth,
        mapHeight: m.mapHeight,
        hasMap: !!m.mapCode,
        hasTileset: !!m.tilesetUrl,
      })));
    } catch (error) {
      console.error("Error fetching maps:", error);
      res.status(500).json({ error: "Failed to fetch maps" });
    }
  });

  app.post("/api/game-assets/initialize-canon-sprites", async (req, res) => {
    try {
      await spriteService.generateCanonCharacterSprites();
      res.json({ success: true, message: "Canon sprite generation initiated" });
    } catch (error) {
      console.error("Error initializing canon sprites:", error);
      res.status(500).json({ error: "Failed to initialize canon sprites" });
    }
  });

  app.post("/api/game-assets/sprites/pregenerate", async (req, res) => {
    try {
      const allCharacters = CANON_CHARACTERS;
      const { characters, concurrency = 2, category } = req.body;
      
      let targetCharacters = allCharacters;
      
      if (category) {
        targetCharacters = allCharacters.filter(c => c.category === category);
      }
      
      if (characters && Array.isArray(characters)) {
        const charNames = new Set(characters);
        targetCharacters = targetCharacters.filter(c => charNames.has(c.name));
      }
      
      if (targetCharacters.length === 0) {
        return res.status(400).json({ error: "No valid characters to generate" });
      }
      
      res.json({ 
        success: true, 
        message: `Starting sprite pre-generation for ${targetCharacters.length} characters`,
        characters: targetCharacters.map(c => c.name),
        estimatedTime: `${Math.ceil(targetCharacters.length / concurrency) * 5} seconds`
      });
      
      const limit = pLimit(concurrency);
      const results: { character: string; status: string; error?: string }[] = [];
      
      const promises = targetCharacters.map((char) => 
        limit(async () => {
          try {
            const existing = await storage.getCharacterSprite(char.name);
            if (existing) {
              console.log(`[Sprite-pregen] Skipping (exists): ${char.name}`);
              results.push({ character: char.name, status: "already_exists" });
              return;
            }
            
            console.log(`[Sprite-pregen] Starting: ${char.name}`);
            await spriteService.getOrCreateSprite(char.name, char.description, { isCanon: true });
            console.log(`[Sprite-pregen] Completed: ${char.name}`);
            results.push({ character: char.name, status: "ready" });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            console.error(`[Sprite-pregen] Failed: ${char.name} - ${errorMsg}`);
            results.push({ character: char.name, status: "failed", error: errorMsg });
          }
        })
      );
      
      Promise.all(promises)
        .then(() => {
          const successful = results.filter(r => r.status === "ready").length;
          const existing = results.filter(r => r.status === "already_exists").length;
          const failed = results.filter(r => r.status === "failed").length;
          console.log(`[Sprite-pregen] Complete: ${successful} new, ${existing} existing, ${failed} failed out of ${targetCharacters.length}`);
        })
        .catch((err) => {
          console.error("[Sprite-pregen] Unexpected error in batch processing:", err);
        });
      
    } catch (error) {
      console.error("Error starting sprite pre-generation:", error);
      res.status(500).json({ error: "Failed to start sprite pre-generation" });
    }
  });

  app.get("/api/game-assets/sprites/status", async (req, res) => {
    try {
      const allCharacters = CANON_CHARACTERS;
      const sprites = await storage.getAllCharacterSprites();
      
      const status = allCharacters.map(char => {
        const existingSprite = sprites.find(s => s.characterName === char.name);
        return {
          characterName: char.name,
          category: char.category,
          generated: !!existingSprite,
          hasSpriteSheet: !!existingSprite?.spriteSheetUrl,
        };
      });
      
      const summary = {
        total: allCharacters.length,
        generated: status.filter(s => s.generated).length,
        pending: status.filter(s => !s.generated).length,
        byCategory: {
          student: status.filter(s => s.category === "student").length,
          staff: status.filter(s => s.category === "staff").length,
          ghost: status.filter(s => s.category === "ghost").length,
          adult: status.filter(s => s.category === "adult").length,
          creature: status.filter(s => s.category === "creature").length,
        },
        generatedByCategory: {
          student: status.filter(s => s.category === "student" && s.generated).length,
          staff: status.filter(s => s.category === "staff" && s.generated).length,
          ghost: status.filter(s => s.category === "ghost" && s.generated).length,
          adult: status.filter(s => s.category === "adult" && s.generated).length,
          creature: status.filter(s => s.category === "creature" && s.generated).length,
        },
      };
      
      res.json({ summary, characters: status });
    } catch (error) {
      console.error("Error fetching sprite status:", error);
      res.status(500).json({ error: "Failed to fetch sprite status" });
    }
  });

  app.post("/api/game-assets/maps/pregenerate", async (req, res) => {
    try {
      const allLocations = Object.keys(HARRY_POTTER_LOCATIONS);
      const { locations, concurrency = 2 } = req.body;
      
      const targetLocations = locations && Array.isArray(locations) 
        ? locations.filter((loc: string) => allLocations.includes(loc))
        : allLocations;
      
      if (targetLocations.length === 0) {
        return res.status(400).json({ error: "No valid locations provided" });
      }
      
      res.json({ 
        success: true, 
        message: `Starting map pre-generation for ${targetLocations.length} locations`,
        locations: targetLocations,
        estimatedTime: `${Math.ceil(targetLocations.length / concurrency) * 10} seconds`
      });
      
      const limit = pLimit(concurrency);
      const results: { location: string; status: string; error?: string }[] = [];
      
      const promises = targetLocations.map((locationName: string) => 
        limit(async () => {
          try {
            console.log(`[Pre-gen] Starting map generation for: ${locationName}`);
            const result = await mapService.getOrCreateMap(locationName, 320, 288);
            console.log(`[Pre-gen] Completed: ${locationName} - Status: ${result.generationStatus}`);
            results.push({ location: locationName, status: result.generationStatus });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            console.error(`[Pre-gen] Failed: ${locationName} - ${errorMsg}`);
            results.push({ location: locationName, status: "failed", error: errorMsg });
          }
        })
      );
      
      Promise.all(promises)
        .then(() => {
          const successful = results.filter(r => r.status === "ready").length;
          const failed = results.filter(r => r.status === "failed").length;
          console.log(`[Pre-gen] Complete: ${successful} successful, ${failed} failed out of ${targetLocations.length}`);
        })
        .catch((err) => {
          console.error("[Pre-gen] Unexpected error in batch map processing:", err);
        });
      
    } catch (error) {
      console.error("Error starting map pre-generation:", error);
      res.status(500).json({ error: "Failed to start map pre-generation" });
    }
  });

  app.get("/api/game-assets/maps/status", async (req, res) => {
    try {
      const allLocations = Object.keys(HARRY_POTTER_LOCATIONS);
      const maps = await storage.getAllLocationMaps();
      
      const status = allLocations.map(locationName => {
        const existingMap = maps.find(m => m.locationName === locationName);
        return {
          locationName,
          generated: !!existingMap,
          hasTileset: !!existingMap?.tilesetUrl,
          status: existingMap?.generationStatus || "not_started",
        };
      });
      
      const summary = {
        total: allLocations.length,
        ready: status.filter(s => s.status === "ready").length,
        generating: status.filter(s => s.status === "generating").length,
        failed: status.filter(s => s.status === "failed").length,
        notStarted: status.filter(s => s.status === "not_started").length,
      };
      
      res.json({ summary, locations: status });
    } catch (error) {
      console.error("Error fetching map status:", error);
      res.status(500).json({ error: "Failed to fetch map status" });
    }
  });

  // ===== ENVIRONMENT ASSET ROUTES =====

  app.get("/api/game-assets/environment", async (req, res) => {
    try {
      const sprites = await storage.getAllEnvironmentSprites();
      res.json(sprites);
    } catch (error) {
      console.error("Error fetching environment sprites:", error);
      res.status(500).json({ error: "Failed to fetch environment sprites" });
    }
  });

  app.get("/api/game-assets/environment/:assetId", async (req, res) => {
    try {
      const { assetId } = req.params;
      const sprite = await storage.getEnvironmentSprite(assetId);
      
      if (!sprite) {
        return res.status(404).json({ error: "Environment sprite not found" });
      }
      
      res.json(sprite);
    } catch (error) {
      console.error("Error fetching environment sprite:", error);
      res.status(500).json({ error: "Failed to fetch environment sprite" });
    }
  });

  app.post("/api/game-assets/environment/pregenerate", async (req, res) => {
    try {
      const { concurrency = 2 } = req.body;
      
      res.json({ 
        success: true, 
        message: `Starting environment asset pre-generation for ${ENVIRONMENT_ASSETS.length} assets`,
        assets: ENVIRONMENT_ASSETS.map(a => a.assetId),
        estimatedTime: `${Math.ceil(ENVIRONMENT_ASSETS.length / concurrency) * 5} seconds`
      });
      
      environmentAssetService.generateAllAssets()
        .then(({ success, failed }) => {
          console.log(`[Env-pregen] Complete: ${success.length} successful, ${failed.length} failed`);
        })
        .catch((err) => {
          console.error("[Env-pregen] Unexpected error:", err);
        });
      
    } catch (error) {
      console.error("Error starting environment pre-generation:", error);
      res.status(500).json({ error: "Failed to start environment pre-generation" });
    }
  });

  app.get("/api/game-assets/environment/status", async (req, res) => {
    try {
      const allAssets = ENVIRONMENT_ASSETS;
      const sprites = await storage.getAllEnvironmentSprites();
      
      const status = allAssets.map(asset => {
        const existingSprite = sprites.find(s => s.assetId === asset.assetId);
        return {
          assetId: asset.assetId,
          category: asset.category,
          description: asset.description,
          generated: !!existingSprite,
          spriteUrl: existingSprite?.spriteUrl || null,
        };
      });
      
      const summary = {
        total: allAssets.length,
        generated: status.filter(s => s.generated).length,
        pending: status.filter(s => !s.generated).length,
        byCategory: {
          nature: status.filter(s => s.category === "nature").length,
          furniture: status.filter(s => s.category === "furniture").length,
          magical: status.filter(s => s.category === "magical").length,
          tools: status.filter(s => s.category === "tools").length,
          effects: status.filter(s => s.category === "effects").length,
        },
        generatedByCategory: {
          nature: status.filter(s => s.category === "nature" && s.generated).length,
          furniture: status.filter(s => s.category === "furniture" && s.generated).length,
          magical: status.filter(s => s.category === "magical" && s.generated).length,
          tools: status.filter(s => s.category === "tools" && s.generated).length,
          effects: status.filter(s => s.category === "effects" && s.generated).length,
        },
      };
      
      res.json({ summary, assets: status });
    } catch (error) {
      console.error("Error fetching environment status:", error);
      res.status(500).json({ error: "Failed to fetch environment status" });
    }
  });
}
