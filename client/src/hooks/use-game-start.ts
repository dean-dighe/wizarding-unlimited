import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { HogwartsHouse } from "@shared/routes";

interface GameStartResponse {
  profileId: number;
  introText: string;
  startingLocation: string;
  playerData: {
    playerName: string;
    house: string;
    level: number;
    stats: {
      maxHp: number;
      currentHp: number;
    };
    equippedSpells: string[];
    currentLocation: string;
  };
}

interface PlayerProfile {
  id: number;
  playerName: string;
  house: string | null;
  level: number;
  experience: number;
  experienceToNext: number;
  galleons: number;
  stats: {
    maxHp: number;
    currentHp: number;
    attack: number;
    defense: number;
    speed: number;
    accuracy: number;
    evasion: number;
    critChance: number;
  };
  knownSpells: string[];
  equippedSpells: string[];
  currentLocation: string;
  trialSigils: number;
  battlesWon: number;
}

export function useGameStart() {
  return useMutation({
    mutationFn: async (data: { playerName: string; house: HogwartsHouse }): Promise<GameStartResponse> => {
      const response = await apiRequest("POST", "/api/game/start", data);
      return response.json();
    },
  });
}

export function usePlayerProfile(profileId: number | null) {
  return useQuery<PlayerProfile>({
    queryKey: ["/api/game/profile", profileId],
    enabled: !!profileId && profileId > 0,
    queryFn: async () => {
      const response = await fetch(`/api/game/profile/${profileId}`);
      if (!response.ok) throw new Error("Failed to fetch profile");
      return response.json();
    },
  });
}

export function useUpdateLocation() {
  return useMutation({
    mutationFn: async ({ profileId, location }: { profileId: number; location: string }) => {
      const response = await apiRequest("PATCH", `/api/game/profile/${profileId}/location`, { location });
      return response.json();
    },
  });
}
