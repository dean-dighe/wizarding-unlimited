import { useState, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";

export interface NPCInteractionResponse {
  success: boolean;
  speaker: string;
  dialogue: string;
  choices: string[];
  stateChanges: {
    healthChange: number;
    itemsAdded: string[];
    itemsRemoved: string[];
    newLocation: string | null;
  } | null;
  error?: string;
  canRetry?: boolean;
}

interface UseOverworldNPCReturn {
  isLoading: boolean;
  error: string | null;
  interactWithNPC: (params: {
    conversationId: number;
    npcId: string;
    npcName: string;
    playerChoice?: string;
    interactionContext?: string;
  }) => Promise<NPCInteractionResponse | null>;
}

export function useOverworldNPC(): UseOverworldNPCReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const interactWithNPC = useCallback(async (params: {
    conversationId: number;
    npcId: string;
    npcName: string;
    playerChoice?: string;
    interactionContext?: string;
  }): Promise<NPCInteractionResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest("POST", "/api/overworld/npc-interact", params);
      const data: NPCInteractionResponse = await response.json();

      if (!data.success) {
        setError(data.error || "Failed to interact with NPC");
        return null;
      }

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error occurred";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    interactWithNPC,
  };
}
