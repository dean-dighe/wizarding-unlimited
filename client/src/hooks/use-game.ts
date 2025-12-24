import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertGameState } from "@shared/schema";

// Session token storage (localStorage for persistence across browser restarts)
export function getSessionToken(conversationId: number): string | null {
  return localStorage.getItem(`game_token_${conversationId}`);
}

export function setSessionToken(conversationId: number, token: string): void {
  localStorage.setItem(`game_token_${conversationId}`, token);
}

export function getAuthHeaders(conversationId: number): HeadersInit {
  const token = getSessionToken(conversationId);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Game State Hook
export function useGameState(conversationId: number | null) {
  return useQuery({
    queryKey: [api.game.getState.path, conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const url = buildUrl(api.game.getState.path, { conversationId });
      const token = getSessionToken(conversationId);
      const res = await fetch(url, {
        credentials: "include",
        headers: token ? { 'x-session-token': token } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch game state");
      return api.game.getState.responses[200].parse(await res.json());
    },
    enabled: !!conversationId,
    // Don't poll - updates come via query invalidation after messages
    // This prevents flickering from constant re-renders
    staleTime: Infinity,
    refetchOnWindowFocus: false,
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
      
      const result = await res.json();
      const parsed = api.game.init.responses[201].parse(result);
      
      // Store the session token for this game
      if (result.sessionToken) {
        setSessionToken(parsed.conversationId, result.sessionToken);
      }
      
      return parsed;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.game.getState.path, data.conversationId] });
    },
  });
}
