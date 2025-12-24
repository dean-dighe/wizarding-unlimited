import { assetRegistry, AssetCatalog } from "./assetRegistry";
import { ScenePayload, SceneCharacterPayload } from "@shared/scenePayload";

export interface ResolvedScene extends ScenePayload {
  assetsReady: boolean;
  pendingGenerations: {
    background: boolean;
    portraits: string[];
  };
}

export class AssetResolver {
  async resolveAssets(
    scene: ScenePayload,
    conversationNPCs: Record<string, string> = {}
  ): Promise<ResolvedScene> {
    const catalog = await assetRegistry.getCatalog(conversationNPCs);
    console.log(`[AssetResolver] Resolving assets for location: ${scene.location}, ${scene.characters.length} characters`);

    const backgroundResult = assetRegistry.findBackground(scene.location, catalog);
    
    if (backgroundResult.asset && backgroundResult.confidence > 0.7) {
      scene.background = {
        action: backgroundResult.asset.status === "ready" && backgroundResult.asset.imageUrl ? "use" : "generate",
        assetId: backgroundResult.asset.id,
        locationName: backgroundResult.asset.locationName,
        reason: `Matched with ${(backgroundResult.confidence * 100).toFixed(0)}% confidence`,
      };
      console.log(`[AssetResolver] Background: use existing asset ${backgroundResult.asset.id} (${backgroundResult.asset.locationName})`);
    } else {
      scene.background = {
        action: "generate",
        locationName: scene.location,
        reason: backgroundResult.asset 
          ? `Low confidence match (${(backgroundResult.confidence * 100).toFixed(0)}%)`
          : "No matching background found",
      };
      console.log(`[AssetResolver] Background: generate new for "${scene.location}"`);
    }

    const resolvedCharacters: SceneCharacterPayload[] = [];
    const pendingPortraits: string[] = [];

    for (const character of scene.characters) {
      const portraitResult = assetRegistry.findPortrait(
        character.name,
        character.expression,
        catalog
      );

      if (portraitResult.asset && portraitResult.confidence > 0.7) {
        resolvedCharacters.push({
          ...character,
          action: portraitResult.asset.status === "ready" && portraitResult.asset.imageUrl ? "use" : "generate",
          matchedAssetId: portraitResult.asset.id,
          confidence: portraitResult.confidence,
        });
        console.log(`[AssetResolver] Portrait: ${character.name} -> use asset ${portraitResult.asset.id}`);
      } else {
        const npcDescription = conversationNPCs[character.name] || character.description;
        resolvedCharacters.push({
          ...character,
          action: "generate",
          description: npcDescription,
          confidence: portraitResult.confidence,
        });
        pendingPortraits.push(character.name);
        console.log(`[AssetResolver] Portrait: ${character.name} -> generate new`);
      }
    }

    scene.characters = resolvedCharacters;

    const backgroundReady = scene.background.action === "use";
    const allPortraitsReady = pendingPortraits.length === 0 && 
      resolvedCharacters.every(c => c.action === "use");

    return {
      ...scene,
      assetsReady: backgroundReady && allPortraitsReady,
      pendingGenerations: {
        background: scene.background.action === "generate",
        portraits: pendingPortraits,
      },
    };
  }

  async waitForAssets(
    scene: ResolvedScene,
    timeoutMs: number = 30000
  ): Promise<ResolvedScene> {
    if (scene.assetsReady) {
      console.log("[AssetResolver] All assets already ready");
      return scene;
    }

    console.log(`[AssetResolver] Waiting for assets (timeout: ${timeoutMs}ms)...`);
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      assetRegistry.invalidateCache();
      const catalog = await assetRegistry.getCatalog();

      let backgroundReady = true;
      if (scene.background.action === "generate" && scene.background.locationName) {
        const bgCheck = assetRegistry.findBackground(scene.background.locationName, catalog);
        if (bgCheck.asset && bgCheck.asset.status === "ready" && bgCheck.asset.imageUrl) {
          scene.background.action = "use";
          scene.background.assetId = bgCheck.asset.id;
          console.log(`[AssetResolver] Background now ready: ${bgCheck.asset.locationName}`);
        } else {
          backgroundReady = false;
        }
      }

      let allPortraitsReady = true;
      for (const character of scene.characters) {
        if (character.action === "generate") {
          const pCheck = assetRegistry.findPortrait(character.name, character.expression, catalog);
          if (pCheck.asset && pCheck.asset.status === "ready" && pCheck.asset.imageUrl) {
            character.action = "use";
            character.matchedAssetId = pCheck.asset.id;
            console.log(`[AssetResolver] Portrait now ready: ${character.name}`);
          } else {
            allPortraitsReady = false;
          }
        }
      }

      if (backgroundReady && allPortraitsReady) {
        scene.assetsReady = true;
        scene.pendingGenerations = { background: false, portraits: [] };
        console.log("[AssetResolver] All assets ready");
        return scene;
      }
    }

    console.warn("[AssetResolver] Timeout waiting for assets, proceeding with available");
    return scene;
  }
}

export const assetResolver = new AssetResolver();
