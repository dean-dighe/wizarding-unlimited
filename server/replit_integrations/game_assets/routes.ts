import type { Express } from "express";
import { SpriteGenerationService } from "./sprites";
import { MapGenerationService } from "./maps";
import { storage } from "../../storage";

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
}
