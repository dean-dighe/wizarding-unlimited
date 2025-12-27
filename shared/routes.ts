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
    start: {
      method: 'POST' as const,
      path: '/api/game/start',
      input: z.object({
        playerName: z.string()
          .min(1, "Name is required")
          .max(50, "Name too long")
          .regex(/^[a-zA-Z\s'-]+$/, "Name can only contain letters, spaces, hyphens, and apostrophes"),
        house: z.enum(HogwartsHouses, { errorMap: () => ({ message: "Please choose a valid Hogwarts house" }) }),
      }),
      responses: {
        201: z.object({
          profileId: z.number(),
          introText: z.string(),
          startingLocation: z.string(),
          playerData: z.object({
            playerName: z.string(),
            house: z.string(),
            level: z.number(),
            stats: z.object({
              maxHp: z.number(),
              currentHp: z.number(),
            }),
            equippedSpells: z.array(z.string()),
            currentLocation: z.string(),
          }),
        }),
      },
    },
    init: {
      method: 'POST' as const,
      path: '/api/game/init',
      input: z.object({
        playerName: z.string()
          .min(1, "Name is required")
          .max(50, "Name too long")
          .regex(/^[a-zA-Z\s'-]+$/, "Name can only contain letters, spaces, hyphens, and apostrophes"),
        house: z.enum(HogwartsHouses, { errorMap: () => ({ message: "Please choose a valid Hogwarts house" }) }),
      }),
      responses: {
        201: z.object({
          conversationId: z.number(),
          message: z.string(),
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
          characterMoods: z.record(z.string(), z.string()).default({}),
          npcSpriteUrls: z.record(z.string(), z.string()).default({}),
          playerSpriteUrl: z.string().nullable(),
          playerSpriteGenerated: z.boolean().default(false),
          decisionCount: z.number(),
        }),
        404: z.object({ message: z.string() }),
      },
    },
    getProfile: {
      method: 'GET' as const,
      path: '/api/game/profile/:profileId',
      responses: {
        200: z.object({
          id: z.number(),
          playerName: z.string(),
          house: z.string().nullable(),
          level: z.number(),
          experience: z.number(),
          experienceToNext: z.number(),
          galleons: z.number(),
          stats: z.object({
            maxHp: z.number(),
            currentHp: z.number(),
            attack: z.number(),
            defense: z.number(),
            speed: z.number(),
            accuracy: z.number(),
            evasion: z.number(),
            critChance: z.number(),
          }),
          knownSpells: z.array(z.string()),
          equippedSpells: z.array(z.string()),
          currentLocation: z.string(),
          trialSigils: z.number(),
          battlesWon: z.number(),
        }),
        404: z.object({ message: z.string() }),
      },
    },
    updateLocation: {
      method: 'PATCH' as const,
      path: '/api/game/profile/:profileId/location',
      input: z.object({
        location: z.string(),
      }),
      responses: {
        200: z.object({ success: z.boolean(), location: z.string() }),
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
