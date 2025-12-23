import { z } from 'zod';

export const api = {
  game: {
    init: {
      method: 'POST' as const,
      path: '/api/game/init',
      input: z.object({
        playerName: z.string().min(1),
        house: z.string().optional(), // Optional, if not provided, Sorting Hat decides
      }),
      responses: {
        201: z.object({
          conversationId: z.number(),
          message: z.string(), // Initial narrative
        }),
      },
    },
    getState: {
      method: 'GET' as const,
      path: '/api/game/:conversationId/state',
      responses: {
        200: z.object({
          house: z.string().nullable(),
          health: z.number(),
          inventory: z.array(z.string()),
          location: z.string(),
          gameTime: z.string(),
        }),
        404: z.object({ message: z.string() }),
      },
    },
  },
};

// Helper to build URLs with params
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
