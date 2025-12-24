import OpenAI from "openai";
import { translatorService, PreviousSceneContext } from "./service";
import { assetResolver, ResolvedScene } from "./assetResolver";
import { ScenePayload } from "@shared/scenePayload";
import type { GameState, StoryArc } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OLLAMA_API_KEY || "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "https://gpt.netsuite.tech/v1",
});

export interface CoordinatedResponse {
  scene: ResolvedScene;
  ttsAudioUrl: string | null;
  generationTimeMs: number;
  errors: string[];
}

export interface PipelineContext {
  conversationId: number;
  gameState: GameState | null;
  storyArc: StoryArc | null;
  chatMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  npcDescriptions: Record<string, string>;
}

async function generateNarrative(
  chatMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>
): Promise<string> {
  console.log("[Pipeline] Generating narrative from AI...");
  const startTime = Date.now();

  const stream = await openai.chat.completions.create({
    model: process.env.OLLAMA_MODEL || "qwen3-coder:30b",
    messages: chatMessages,
    stream: true,
  });

  let fullResponse = "";
  for await (const chunk of stream) {
    const chunkContent = chunk.choices[0]?.delta?.content || "";
    if (chunkContent) {
      fullResponse += chunkContent;
    }
  }

  console.log(`[Pipeline] Narrative generated (${fullResponse.length} chars) in ${Date.now() - startTime}ms`);
  return fullResponse;
}

async function generateTTS(text: string): Promise<string | null> {
  try {
    const paragraphs = text.split(/\n{2,}/);
    const finalParagraph = paragraphs.filter(p => p.trim().length > 20).pop() || text.slice(-500);
    
    const response = await fetch(`http://localhost:5000/api/tts/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: finalParagraph.slice(0, 500) }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`[Pipeline] TTS generated successfully`);
      return data.audioUrl || null;
    }
  } catch (error) {
    console.warn("[Pipeline] TTS generation failed, continuing without audio");
  }
  return null;
}

async function triggerBackgroundGeneration(locationName: string): Promise<void> {
  try {
    await fetch(`http://localhost:5000/api/vn-assets/backgrounds/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationName }),
    });
    console.log(`[Pipeline] Triggered background generation for: ${locationName}`);
  } catch (error) {
    console.warn(`[Pipeline] Failed to trigger background generation:`, error);
  }
}

async function triggerPortraitGeneration(
  characterName: string,
  expression: string,
  description?: string
): Promise<void> {
  try {
    await fetch(`http://localhost:5000/api/vn-assets/portraits/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterName, expression, description }),
    });
    console.log(`[Pipeline] Triggered portrait generation for: ${characterName} (${expression})`);
  } catch (error) {
    console.warn(`[Pipeline] Failed to trigger portrait generation:`, error);
  }
}

export async function runCoordinatedPipeline(
  context: PipelineContext
): Promise<CoordinatedResponse> {
  const startTime = Date.now();
  const errors: string[] = [];

  console.log(`[Pipeline] Starting coordinated pipeline for conversation ${context.conversationId}`);

  let narrativeText: string;
  try {
    narrativeText = await generateNarrative(context.chatMessages);
    if (!narrativeText || narrativeText.trim().length < 20) {
      throw new Error("AI returned empty or invalid response");
    }
  } catch (error: any) {
    console.error("[Pipeline] Narrative generation failed:", error);
    throw error;
  }

  const previousContext: PreviousSceneContext = {
    location: context.gameState?.location || undefined,
    time: context.gameState?.gameTime || undefined,
    npcDescriptions: context.npcDescriptions,
    trialProgress: context.storyArc ? {
      currentTrial: context.storyArc.currentChapterIndex + 1,
      trialName: context.storyArc.chapters[context.storyArc.currentChapterIndex]?.title,
    } : undefined,
  };

  let scene: ScenePayload;
  try {
    scene = await translatorService.extractSceneData(narrativeText, previousContext);
    console.log(`[Pipeline] Scene extracted: ${scene.location}, ${scene.characters.length} characters, confidence: ${scene.confidence}`);
  } catch (error: any) {
    console.error("[Pipeline] Translation failed:", error);
    errors.push("Scene extraction failed, using fallback");
    scene = {
      location: context.gameState?.location || "The Undercroft",
      narrativeText,
      cleanedText: narrativeText,
      ambiance: { lighting: "dim", weather: "clear", mood: "tense", sounds: [] },
      characters: [],
      choices: [],
      background: { action: "pending" },
      stateChanges: { healthChange: 0, itemsAdded: [], itemsRemoved: [], spellsLearned: [] },
      narratorMood: "ominous",
      trialProgress: {},
      confidence: 0.1,
      extractionWarnings: ["translation failed"],
    };
  }

  let resolvedScene: ResolvedScene;
  try {
    resolvedScene = await assetResolver.resolveAssets(scene, context.npcDescriptions);
  } catch (error: any) {
    console.error("[Pipeline] Asset resolution failed:", error);
    errors.push("Asset resolution failed");
    resolvedScene = {
      ...scene,
      assetsReady: false,
      pendingGenerations: { background: true, portraits: scene.characters.map(c => c.name) },
    };
  }

  if (resolvedScene.pendingGenerations.background && scene.location) {
    triggerBackgroundGeneration(scene.location);
  }
  for (const character of scene.characters) {
    if (character.action === "generate") {
      triggerPortraitGeneration(character.name, character.expression, character.description);
    }
  }

  const [ttsResult, finalScene] = await Promise.all([
    generateTTS(scene.cleanedText),
    assetResolver.waitForAssets(resolvedScene, 15000),
  ]);

  const generationTimeMs = Date.now() - startTime;
  console.log(`[Pipeline] Coordinated pipeline complete in ${generationTimeMs}ms`);

  return {
    scene: finalScene,
    ttsAudioUrl: ttsResult,
    generationTimeMs,
    errors,
  };
}
