import { useQuery } from "@tanstack/react-query";

interface SpriteData {
  characterName: string;
  spriteSheetUrl: string;
  spriteWidth: number;
  spriteHeight: number;
  frameCount: number;
  animationConfig: {
    idle: { start: number; end: number; frameRate: number };
    walkDown: { start: number; end: number; frameRate: number };
    walkUp: { start: number; end: number; frameRate: number };
    walkLeft: { start: number; end: number; frameRate: number };
    walkRight: { start: number; end: number; frameRate: number };
    cast: { start: number; end: number; frameRate: number };
  };
}

interface MapData {
  locationName: string;
  mapCode: string;
  tilesetUrl: string | null;
  mapWidth: number;
  mapHeight: number;
  spawnPoints: Record<string, { x: number; y: number }>;
}

export function usePlayerSprite(playerName: string | null | undefined) {
  return useQuery<SpriteData>({
    queryKey: ["/api/game-assets/sprite", playerName],
    enabled: !!playerName,
  });
}

export function useLocationMap(locationName: string | null | undefined) {
  return useQuery<MapData>({
    queryKey: ["/api/game-assets/map", locationName],
    enabled: !!locationName,
  });
}

export function useNPCSprite(npcName: string | null | undefined) {
  return useQuery<SpriteData>({
    queryKey: ["/api/game-assets/sprite", npcName],
    enabled: !!npcName,
  });
}

export function useGameCanvasData(playerName: string | null | undefined, locationName: string | null | undefined) {
  const playerSpriteQuery = usePlayerSprite(playerName);
  const locationMapQuery = useLocationMap(locationName);
  
  const isLoading = playerSpriteQuery.isLoading || locationMapQuery.isLoading;
  const hasData = !!playerSpriteQuery.data || !!locationMapQuery.data;
  
  return {
    playerSprite: playerSpriteQuery.data,
    locationMap: locationMapQuery.data,
    isLoading,
    hasData,
    playerSpriteUrl: playerSpriteQuery.data?.spriteSheetUrl,
  };
}

// Convert string position (north, south, center, etc.) to pixel coordinates
export function positionToCoordinates(
  position: string,
  width: number,
  height: number
): { x: number; y: number } {
  const padding = 48; // Keep away from walls
  const centerX = width / 2;
  const centerY = height / 2;
  
  const positions: Record<string, { x: number; y: number }> = {
    center: { x: centerX, y: centerY },
    north: { x: centerX, y: padding },
    south: { x: centerX, y: height - padding },
    east: { x: width - padding, y: centerY },
    west: { x: padding, y: centerY },
    northeast: { x: width - padding, y: padding },
    northwest: { x: padding, y: padding },
    southeast: { x: width - padding, y: height - padding },
    southwest: { x: padding, y: height - padding },
  };
  
  return positions[position.toLowerCase()] || positions.center;
}
