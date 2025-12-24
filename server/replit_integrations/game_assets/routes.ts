import type { Express } from "express";
import { SpriteGenerationService } from "./sprites";
import { MapGenerationService, HARRY_POTTER_LOCATIONS } from "./maps";
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
      
      res.json({
        locationName: decodedName,
        tilesetUrl: result.tilesetUrl,
        tilemapData: result.tilemapData,
        spawnPoints: result.spawnPoints,
        generationStatus: result.generationStatus,
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
      
      Promise.all(promises).then(() => {
        const successful = results.filter(r => r.status === "ready").length;
        const failed = results.filter(r => r.status === "failed").length;
        console.log(`[Pre-gen] Complete: ${successful} successful, ${failed} failed out of ${targetLocations.length}`);
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
}
