import { z } from "zod";
import type { PortraitPosition, PortraitExpression } from "./schema";

export const AssetActionSchema = z.enum(["use", "generate", "pending"]);
export type AssetAction = z.infer<typeof AssetActionSchema>;

export const SceneCharacterSchema = z.object({
  name: z.string(),
  position: z.enum(["left", "center", "right", "far-left", "far-right"]).default("center"),
  expression: z.enum(["neutral", "happy", "sad", "angry", "surprised", "worried", "determined", "mysterious", "scared"]).default("neutral"),
  speaking: z.boolean().default(false),
  description: z.string().optional(),
  action: AssetActionSchema.default("pending"),
  matchedAssetId: z.number().optional(),
  confidence: z.number().min(0).max(1).default(0),
});
export type SceneCharacterPayload = z.infer<typeof SceneCharacterSchema>;

export const ChoiceSchema = z.object({
  text: z.string(),
  spellInvolved: z.string().optional(),
  direction: z.string().optional(),
  consequence: z.string().optional(),
});
export type ChoicePayload = z.infer<typeof ChoiceSchema>;

export const AmbianceSchema = z.object({
  lighting: z.string().default("dim"),
  weather: z.string().default("clear"),
  mood: z.string().default("tense"),
  sounds: z.array(z.string()).default([]),
});
export type AmbiancePayload = z.infer<typeof AmbianceSchema>;

export const BackgroundDirectiveSchema = z.object({
  action: AssetActionSchema.default("pending"),
  assetId: z.number().optional(),
  locationName: z.string().optional(),
  reason: z.string().optional(),
});
export type BackgroundDirective = z.infer<typeof BackgroundDirectiveSchema>;

export const StateChangesSchema = z.object({
  healthChange: z.number().default(0),
  itemsAdded: z.array(z.string()).default([]),
  itemsRemoved: z.array(z.string()).default([]),
  spellsLearned: z.array(z.string()).default([]),
  newLocation: z.string().optional(),
  timeAdvance: z.string().optional(),
});
export type StateChangesPayload = z.infer<typeof StateChangesSchema>;

export const ScenePayloadSchema = z.object({
  location: z.string(),
  time: z.string().optional(),
  ambiance: AmbianceSchema.default({}),
  
  narrativeText: z.string(),
  cleanedText: z.string(),
  
  characters: z.array(SceneCharacterSchema).default([]),
  choices: z.array(ChoiceSchema).default([]),
  
  background: BackgroundDirectiveSchema.default({}),
  stateChanges: StateChangesSchema.default({}),
  
  narratorMood: z.string().default("ominous"),
  trialProgress: z.object({
    currentTrial: z.number().min(1).max(5).optional(),
    trialName: z.string().optional(),
    phase: z.string().optional(),
  }).default({}),
  
  confidence: z.number().min(0).max(1).default(0.5),
  extractionWarnings: z.array(z.string()).default([]),
});

export type ScenePayload = z.infer<typeof ScenePayloadSchema>;

export const EmptyScenePayload: ScenePayload = {
  location: "Unknown",
  ambiance: { lighting: "dim", weather: "clear", mood: "tense", sounds: [] },
  narrativeText: "",
  cleanedText: "",
  characters: [],
  choices: [],
  background: { action: "pending" },
  stateChanges: { healthChange: 0, itemsAdded: [], itemsRemoved: [], spellsLearned: [] },
  narratorMood: "ominous",
  trialProgress: {},
  confidence: 0,
  extractionWarnings: [],
};
