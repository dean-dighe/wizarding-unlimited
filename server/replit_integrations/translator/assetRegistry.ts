import { db } from "../../db";
import { background_scenes, character_portraits } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface BackgroundAsset {
  id: number;
  locationName: string;
  imageUrl: string | null;
  status: string;
}

export interface PortraitAsset {
  id: number;
  characterName: string;
  expression: string;
  imageUrl: string | null;
  status: string;
  appearanceSignature: string | null;
}

export interface AssetCatalog {
  backgrounds: BackgroundAsset[];
  portraits: PortraitAsset[];
  npcDescriptions: Record<string, string>;
  lastRefreshed: number;
}

const CACHE_TTL_MS = 60000;

class AssetRegistry {
  private cache: AssetCatalog | null = null;
  private cacheTimestamp: number = 0;

  async getCatalog(conversationNPCs: Record<string, string> = {}): Promise<AssetCatalog> {
    const now = Date.now();
    
    if (this.cache && (now - this.cacheTimestamp) < CACHE_TTL_MS) {
      return {
        ...this.cache,
        npcDescriptions: { ...this.cache.npcDescriptions, ...conversationNPCs }
      };
    }

    console.log("[AssetRegistry] Refreshing asset catalog...");
    
    const [backgrounds, portraits] = await Promise.all([
      db.select({
        id: background_scenes.id,
        locationName: background_scenes.locationName,
        imageUrl: background_scenes.imageUrl,
        status: background_scenes.generationStatus,
      }).from(background_scenes),
      
      db.select({
        id: character_portraits.id,
        characterName: character_portraits.characterName,
        expression: character_portraits.expression,
        imageUrl: character_portraits.imageUrl,
        status: character_portraits.generationStatus,
        appearanceSignature: character_portraits.appearanceSignature,
      }).from(character_portraits),
    ]);

    this.cache = {
      backgrounds: backgrounds.map(b => ({
        id: b.id,
        locationName: b.locationName,
        imageUrl: b.imageUrl,
        status: b.status || "pending",
      })),
      portraits: portraits.map(p => ({
        id: p.id,
        characterName: p.characterName,
        expression: p.expression || "neutral",
        imageUrl: p.imageUrl,
        status: p.status || "pending",
        appearanceSignature: p.appearanceSignature,
      })),
      npcDescriptions: conversationNPCs,
      lastRefreshed: now,
    };
    this.cacheTimestamp = now;

    console.log(`[AssetRegistry] Cached ${backgrounds.length} backgrounds, ${portraits.length} portraits`);
    return this.cache;
  }

  invalidateCache(): void {
    this.cache = null;
    this.cacheTimestamp = 0;
    console.log("[AssetRegistry] Cache invalidated");
  }

  normalizeLocationName(name: string): string {
    return name
      .toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[^\w\s']/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  normalizeCharacterName(name: string): string {
    return name
      .toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[^\w\s']/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }

  fuzzyMatch(query: string, target: string, threshold: number = 0.7): { match: boolean; confidence: number } {
    const normalizedQuery = this.normalizeLocationName(query);
    const normalizedTarget = this.normalizeLocationName(target);
    
    if (normalizedQuery === normalizedTarget) {
      return { match: true, confidence: 1.0 };
    }
    
    if (normalizedTarget.includes(normalizedQuery) || normalizedQuery.includes(normalizedTarget)) {
      return { match: true, confidence: 0.9 };
    }
    
    const maxLen = Math.max(normalizedQuery.length, normalizedTarget.length);
    if (maxLen === 0) return { match: false, confidence: 0 };
    
    const distance = this.levenshteinDistance(normalizedQuery, normalizedTarget);
    const similarity = 1 - (distance / maxLen);
    
    return {
      match: similarity >= threshold,
      confidence: similarity,
    };
  }

  findBackground(locationName: string, catalog: AssetCatalog): { asset: BackgroundAsset | null; confidence: number } {
    let bestMatch: BackgroundAsset | null = null;
    let bestConfidence = 0;
    
    for (const bg of catalog.backgrounds) {
      const { match, confidence } = this.fuzzyMatch(locationName, bg.locationName);
      if (match && confidence > bestConfidence) {
        bestMatch = bg;
        bestConfidence = confidence;
      }
    }
    
    return { asset: bestMatch, confidence: bestConfidence };
  }

  findPortrait(
    characterName: string,
    expression: string,
    catalog: AssetCatalog
  ): { asset: PortraitAsset | null; confidence: number } {
    let bestMatch: PortraitAsset | null = null;
    let bestConfidence = 0;
    
    for (const portrait of catalog.portraits) {
      const { match, confidence } = this.fuzzyMatch(characterName, portrait.characterName, 0.8);
      if (match) {
        let adjustedConfidence = confidence;
        if (portrait.expression === expression) {
          adjustedConfidence += 0.1;
        }
        if (portrait.status === "ready" && portrait.imageUrl) {
          adjustedConfidence += 0.05;
        }
        
        if (adjustedConfidence > bestConfidence) {
          bestMatch = portrait;
          bestConfidence = Math.min(adjustedConfidence, 1.0);
        }
      }
    }
    
    return { asset: bestMatch, confidence: bestConfidence };
  }
}

export const assetRegistry = new AssetRegistry();
