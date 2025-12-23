import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertGameState } from "@shared/schema";

// Game State Hook
export function useGameState(conversationId: number | null) {
  return useQuery({
    queryKey: [api.game.getState.path, conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const url = buildUrl(api.game.getState.path, { conversationId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch game state");
      return api.game.getState.responses[200].parse(await res.json());
    },
    enabled: !!conversationId,
    refetchInterval: 5000, // Poll every 5s for updates
  });
}

// Game Init Hook
export function useInitGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: typeof api.game.init.input._type) => {
      const validated = api.game.init.input.parse(data);
      const res = await fetch(api.game.init.path, {
        method: api.game.init.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to initialize game");
      }
      
      return api.game.init.responses[201].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.game.getState.path, data.conversationId] });
    },
  });
}
