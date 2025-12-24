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

interface TilemapLayer {
  name: string;
  data: number[];
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
}

interface PlacedObject {
  assetId: string;
  x: number;
  y: number;
  scale?: number;
  flipX?: boolean;
}

interface TilemapData {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  layers: TilemapLayer[];
  tilesetName: string;
  objects?: PlacedObject[];
}

type MapGenerationStatus = "pending" | "generating" | "ready" | "failed";

interface MapData {
  locationName: string;
  tilesetUrl: string | null;
  tilemapData: TilemapData | null;
  spawnPoints: Record<string, { x: number; y: number }>;
  generationStatus: MapGenerationStatus;
  environmentSprites?: Record<string, string>;
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
    staleTime: 30000,
    refetchInterval: (query) => {
      const data = query.state.data as MapData | undefined;
      if (data?.generationStatus === "generating") {
        return 3000;
      }
      return false;
    },
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
  const isMapGenerating = locationMapQuery.data?.generationStatus === "generating";
  const isMapReady = locationMapQuery.data?.generationStatus === "ready";
  
  return {
    playerSprite: playerSpriteQuery.data,
    locationMap: locationMapQuery.data,
    isLoading,
    isMapGenerating,
    isMapReady,
    playerSpriteUrl: playerSpriteQuery.data?.spriteSheetUrl,
    tilesetUrl: locationMapQuery.data?.tilesetUrl,
    tilemapData: locationMapQuery.data?.tilemapData,
    spawnPoints: locationMapQuery.data?.spawnPoints,
    environmentSprites: locationMapQuery.data?.environmentSprites,
  };
}

export function positionToCoordinates(
  position: string,
  width: number,
  height: number
): { x: number; y: number } {
  const padding = 48;
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

export type { SpriteData, MapData, TilemapData, TilemapLayer, MapGenerationStatus };
