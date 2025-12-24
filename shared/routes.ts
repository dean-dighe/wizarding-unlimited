import { z } from 'zod';

// Valid Hogwarts houses
export const HogwartsHouses = ["Gryffindor", "Slytherin", "Ravenclaw", "Hufflepuff"] as const;
export type HogwartsHouse = typeof HogwartsHouses[number];

// Story Arc schema for validation
export const StoryArcSchema = z.object({
  title: z.string(),
  premise: z.string(),
  chapters: z.array(z.object({
    title: z.string(),
    objective: z.string(),
    keyEvents: z.array(z.string()),
    completed: z.boolean(),
  })),
  currentChapterIndex: z.number(),
});

export const api = {
  game: {
    init: {
      method: 'POST' as const,
      path: '/api/game/init',
      input: z.object({
        // Max 50 chars, only letters, spaces, hyphens, apostrophes
        playerName: z.string()
          .min(1, "Name is required")
          .max(50, "Name too long")
          .regex(/^[a-zA-Z\s'-]+$/, "Name can only contain letters, spaces, hyphens, and apostrophes"),
        house: z.enum(HogwartsHouses, { errorMap: () => ({ message: "Please choose a valid Hogwarts house" }) }),
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
          playerName: z.string().nullable(),
          house: z.string().nullable(),
          health: z.number(),
          inventory: z.array(z.string()),
          spells: z.array(z.string()),
          location: z.string(),
          gameTime: z.string(),
          characterDescription: z.string().nullable(),
          storyArc: StoryArcSchema.nullable(),
          npcDescriptions: z.record(z.string(), z.string()).nullable(),
          npcPositions: z.record(z.string(), z.string()).default({}),
          npcSpriteUrls: z.record(z.string(), z.string()).default({}),
          playerSpriteUrl: z.string().nullable(),
          decisionCount: z.number(),
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
