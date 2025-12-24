import OpenAI from "openai";
import { ScenePayload, ScenePayloadSchema, EmptyScenePayload } from "@shared/scenePayload";
import type { GameState, StoryArc } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OLLAMA_API_KEY || "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "https://gpt.netsuite.tech/v1",
});

const EXTRACTION_PROMPT = `You are a scene data extractor. Analyze the following narrative text and extract structured scene data.

IMPORTANT: Return ONLY valid JSON, no markdown, no explanation, no code blocks.

Extract:
1. location - The current scene location
2. time - In-game time if mentioned
3. ambiance - lighting, weather, mood, sounds
4. characters - All characters present with their position (left/center/right/far-left/far-right), expression (neutral/happy/sad/angry/surprised/worried/determined/mysterious/scared), and if speaking
5. choices - The 4 player choices with any spells involved
6. stateChanges - health changes, items added/removed, spells learned, location changes
7. narratorMood - overall tone (ominous, tense, hopeful, dark, mysterious)
8. trialProgress - if trial progress is mentioned (trial number 1-5, phase)

For characters not explicitly positioned, infer based on narrative cues.
For missing data, use reasonable defaults based on context.

PREVIOUS SCENE STATE:
{{PREVIOUS_STATE}}

NARRATIVE TEXT TO ANALYZE:
{{NARRATIVE}}

Return JSON matching this structure:
{
  "location": "string",
  "time": "string or null",
  "ambiance": { "lighting": "string", "weather": "string", "mood": "string", "sounds": ["string"] },
  "characters": [{ "name": "string", "position": "string", "expression": "string", "speaking": boolean, "description": "string or null" }],
  "choices": [{ "text": "string", "spellInvolved": "string or null" }],
  "stateChanges": { "healthChange": number, "itemsAdded": [], "itemsRemoved": [], "spellsLearned": [], "newLocation": "string or null" },
  "narratorMood": "string",
  "trialProgress": { "currentTrial": number or null, "trialName": "string or null", "phase": "string or null" },
  "confidence": 0.0-1.0
}`;

export interface PreviousSceneContext {
  location?: string;
  time?: string;
  characters?: Array<{ name: string; position: string; expression: string }>;
  npcDescriptions?: Record<string, string>;
  trialProgress?: { currentTrial?: number; trialName?: string };
}

export class TranslatorService {
  async extractSceneData(
    narrativeText: string,
    previousContext: PreviousSceneContext = {}
  ): Promise<ScenePayload> {
    const startTime = Date.now();
    console.log(`[Translator] Starting scene extraction (${narrativeText.length} chars)`);

    try {
      const previousStateJson = JSON.stringify(previousContext, null, 2);
      const prompt = EXTRACTION_PROMPT
        .replace("{{PREVIOUS_STATE}}", previousStateJson)
        .replace("{{NARRATIVE}}", narrativeText);

      const response = await openai.chat.completions.create({
        model: process.env.OLLAMA_MODEL || "qwen3-coder:30b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content || "";
      console.log(`[Translator] Got response (${content.length} chars) in ${Date.now() - startTime}ms`);

      const parsed = this.parseJsonResponse(content, narrativeText);
      return this.mergeWithDefaults(parsed, previousContext, narrativeText);
    } catch (error) {
      console.error("[Translator] Extraction failed:", error);
      return this.fallbackExtraction(narrativeText, previousContext);
    }
  }

  private parseJsonResponse(content: string, originalNarrative: string): Partial<ScenePayload> {
    let jsonStr = content.trim();
    
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    if (jsonStr.includes("</think>")) {
      const thinkEnd = jsonStr.lastIndexOf("</think>");
      jsonStr = jsonStr.slice(thinkEnd + 8).trim();
    }

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    try {
      const parsed = JSON.parse(jsonStr);
      console.log(`[Translator] Successfully parsed JSON`);
      return parsed;
    } catch (parseError) {
      console.warn(`[Translator] JSON parse failed, using fallback`);
      return {};
    }
  }

  private mergeWithDefaults(
    extracted: Partial<ScenePayload>,
    previousContext: PreviousSceneContext,
    narrativeText: string
  ): ScenePayload {
    const warnings: string[] = [];

    if (!extracted.location && previousContext.location) {
      extracted.location = previousContext.location;
      warnings.push("location inferred from previous scene");
    }
    if (!extracted.location) {
      extracted.location = "The Undercroft";
      warnings.push("location defaulted");
    }

    if (!extracted.time && previousContext.time) {
      extracted.time = previousContext.time;
    }

    if (!extracted.characters || extracted.characters.length === 0) {
      if (previousContext.characters && previousContext.characters.length > 0) {
        extracted.characters = previousContext.characters.map(c => ({
          name: c.name,
          position: c.position as any,
          expression: c.expression as any,
          speaking: false,
          action: "pending" as const,
          confidence: 0.3,
        }));
        warnings.push("characters inferred from previous scene");
      }
    }

    const cleanedText = this.cleanNarrativeText(narrativeText);

    const result: ScenePayload = {
      location: extracted.location || "Unknown",
      time: extracted.time,
      ambiance: extracted.ambiance || { lighting: "dim", weather: "clear", mood: "tense", sounds: [] },
      narrativeText: narrativeText,
      cleanedText: cleanedText,
      characters: (extracted.characters || []).map(c => ({
        name: c.name,
        position: (c.position || "center") as any,
        expression: (c.expression || "neutral") as any,
        speaking: c.speaking || false,
        description: c.description,
        action: "pending" as const,
        confidence: c.confidence || 0.5,
      })),
      choices: extracted.choices || [],
      background: { action: "pending" },
      stateChanges: extracted.stateChanges || { healthChange: 0, itemsAdded: [], itemsRemoved: [], spellsLearned: [] },
      narratorMood: extracted.narratorMood || "ominous",
      trialProgress: extracted.trialProgress || {},
      confidence: extracted.confidence || 0.5,
      extractionWarnings: warnings,
    };

    try {
      return ScenePayloadSchema.parse(result);
    } catch (validationError) {
      console.warn("[Translator] Schema validation failed, returning with defaults");
      return { ...EmptyScenePayload, narrativeText, cleanedText, location: extracted.location || "Unknown" };
    }
  }

  private fallbackExtraction(narrativeText: string, previousContext: PreviousSceneContext): ScenePayload {
    console.log("[Translator] Using regex fallback extraction");
    
    const locationMatch = narrativeText.match(/\[LOCATION:\s*([^\]]+)\]/i);
    const location = locationMatch?.[1]?.trim() || previousContext.location || "The Undercroft";

    const choiceMatches = narrativeText.matchAll(/^\s*\d+\.\s*(.+)$/gm);
    const choices = Array.from(choiceMatches).map(m => ({ text: m[1].trim() }));

    const healthMatch = narrativeText.match(/\[HEALTH:\s*([+-]?\d+)\]/i);
    const healthChange = healthMatch ? parseInt(healthMatch[1], 10) : 0;

    const itemAddMatches = narrativeText.matchAll(/\[ITEM_ADD:\s*([^\]]+)\]/gi);
    const itemsAdded = Array.from(itemAddMatches).map(m => m[1].trim());

    const cleanedText = this.cleanNarrativeText(narrativeText);

    return {
      location,
      ambiance: { lighting: "dim", weather: "clear", mood: "tense", sounds: [] },
      narrativeText,
      cleanedText,
      characters: [],
      choices,
      background: { action: "pending" },
      stateChanges: { healthChange, itemsAdded, itemsRemoved: [], spellsLearned: [] },
      narratorMood: "ominous",
      trialProgress: {},
      confidence: 0.2,
      extractionWarnings: ["used fallback regex extraction"],
    };
  }

  private cleanNarrativeText(text: string): string {
    return text
      .replace(/\[HEALTH:\s*[+-]?\d+\]/gi, '')
      .replace(/\[ITEM_ADD:\s*[^\]]+\]/gi, '')
      .replace(/\[ITEM_REMOVE:\s*[^\]]+\]/gi, '')
      .replace(/\[SPELL_LEARN:\s*[^\]]+\]/gi, '')
      .replace(/\[LOCATION:\s*[^\]]+\]/gi, '')
      .replace(/\[CHARACTER:\s*[^|]+\|[^\]]+\]/gi, '')
      .replace(/\[NPC_POSITION:\s*[^|]+\|[^\]]+\]/gi, '')
      .replace(/\[MOOD:\s*[^|]+\|[^\]]+\]/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

export const translatorService = new TranslatorService();
