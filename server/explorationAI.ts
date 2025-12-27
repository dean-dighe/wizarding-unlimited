/**
 * Exploration-Focused AI Prompts
 * Short, contextual AI responses for Pokemon-style gameplay
 * Designed for brief interactions, not endless conversation loops
 */

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OLLAMA_API_KEY || "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "https://gpt.netsuite.tech/v1",
});

const MODEL = process.env.OLLAMA_MODEL || "qwen3-coder:30b";

export interface PlayerContext {
  playerName: string;
  house: string;
  level: number;
  currentLocation: string;
  trialSigils?: number;
}

export interface IntroResult {
  introText: string;
  startingLocation: string;
}

export async function generateGameIntro(
  playerName: string,
  house: string
): Promise<IntroResult> {
  const houseTraits: Record<string, string> = {
    Gryffindor: "brave and bold",
    Slytherin: "cunning and ambitious", 
    Ravenclaw: "wise and curious",
    Hufflepuff: "loyal and determined",
  };

  const trait = houseTraits[house] || "eager";

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You write brief, atmospheric opening narration for a Harry Potter exploration game. 
Keep it to 2-3 sentences. Set the scene, don't start a conversation. 
The player is about to explore Hogwarts freely. End with them arriving at a location.
No dialogue. No choices. Just scene-setting.`,
        },
        {
          role: "user",
          content: `Write a brief opening for ${playerName}, a third-year ${house} student (${trait}). 
They're starting their day at Hogwarts, ready to explore. End with them in the Great Hall.`,
        },
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    const text = response.choices[0]?.message?.content?.trim() || 
      `The morning sun streams through the enchanted ceiling of the Great Hall as ${playerName} settles into the ${house} table. Another day of magic awaits.`;

    return {
      introText: text,
      startingLocation: "Great Hall",
    };
  } catch (error) {
    console.error("Error generating game intro:", error);
    return {
      introText: `The morning sun streams through the enchanted ceiling of the Great Hall as ${playerName} settles into the ${house} table. Another day of magic awaits.`,
      startingLocation: "Great Hall",
    };
  }
}

export async function describeLocation(
  locationName: string,
  context: PlayerContext,
  timeOfDay?: string
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You describe Hogwarts locations in 1-2 atmospheric sentences.
Be evocative but brief. Mention any notable activity or mood.
No dialogue. No player actions. Just the scene.`,
        },
        {
          role: "user", 
          content: `Describe ${locationName} at Hogwarts${timeOfDay ? ` (${timeOfDay})` : ""}. 
The player is ${context.playerName}, a level ${context.level} ${context.house} student.`,
        },
      ],
      max_tokens: 80,
      temperature: 0.8,
    });

    return response.choices[0]?.message?.content?.trim() || 
      `You enter ${locationName}.`;
  } catch (error) {
    console.error("Error describing location:", error);
    return `You enter ${locationName}.`;
  }
}

export interface NPCDialogueResult {
  greeting: string;
  choices: string[];
  npcMood: "friendly" | "neutral" | "suspicious" | "busy";
}

export async function generateNPCGreeting(
  npcName: string,
  npcRole: string,
  context: PlayerContext,
  relationship?: number
): Promise<NPCDialogueResult> {
  const relationshipDesc = relationship !== undefined
    ? relationship > 50 ? "friendly with" : relationship < -20 ? "wary of" : "neutral toward"
    : "meeting";

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You generate brief NPC greetings for a Harry Potter game.
Output JSON only: {"greeting": "1-2 sentences", "choices": ["option1", "option2", "option3"], "npcMood": "friendly|neutral|suspicious|busy"}
Choices should be simple actions: ask about something, request help, say goodbye.
Always include a "goodbye" or "leave" option. Max 3 choices.`,
        },
        {
          role: "user",
          content: `${npcName} (${npcRole}) is ${relationshipDesc} ${context.playerName} (${context.house}, level ${context.level}).
Generate their greeting and 3 dialogue choices.`,
        },
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content?.trim() || "";
    
    try {
      const parsed = JSON.parse(content);
      return {
        greeting: parsed.greeting || `${npcName} notices you.`,
        choices: parsed.choices || ["Ask for help", "Chat briefly", "Leave"],
        npcMood: parsed.npcMood || "neutral",
      };
    } catch {
      return {
        greeting: `${npcName} looks up as you approach.`,
        choices: ["Ask for help", "Chat briefly", "Leave"],
        npcMood: "neutral",
      };
    }
  } catch (error) {
    console.error("Error generating NPC greeting:", error);
    return {
      greeting: `${npcName} acknowledges your presence.`,
      choices: ["Ask for help", "Chat briefly", "Leave"],
      npcMood: "neutral",
    };
  }
}

export interface NPCResponseResult {
  response: string;
  endConversation: boolean;
  nextChoices?: string[];
}

export async function generateNPCResponse(
  npcName: string,
  npcRole: string,
  playerChoice: string,
  context: PlayerContext
): Promise<NPCResponseResult> {
  const isGoodbye = playerChoice.toLowerCase().includes("leave") || 
                    playerChoice.toLowerCase().includes("goodbye") ||
                    playerChoice.toLowerCase().includes("bye");

  if (isGoodbye) {
    return {
      response: `${npcName} nods as you take your leave.`,
      endConversation: true,
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You generate brief NPC responses for a Harry Potter game.
Output JSON only: {"response": "1-2 sentences", "endConversation": true/false, "nextChoices": ["option1", "option2"]}
Keep responses short. If the interaction naturally ends, set endConversation: true.
If continuing, provide 2 follow-up choices including "Leave".`,
        },
        {
          role: "user",
          content: `${npcName} (${npcRole}) responds to ${context.playerName} who chose: "${playerChoice}"`,
        },
      ],
      max_tokens: 120,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content?.trim() || "";
    
    try {
      const parsed = JSON.parse(content);
      return {
        response: parsed.response || `${npcName} responds briefly.`,
        endConversation: parsed.endConversation ?? false,
        nextChoices: parsed.nextChoices || ["Thank them", "Leave"],
      };
    } catch {
      return {
        response: `${npcName} responds to your inquiry.`,
        endConversation: false,
        nextChoices: ["Continue", "Leave"],
      };
    }
  } catch (error) {
    console.error("Error generating NPC response:", error);
    return {
      response: `${npcName} nods thoughtfully.`,
      endConversation: false,
      nextChoices: ["Continue", "Leave"],
    };
  }
}

export async function generateBattleIntro(
  creatureName: string,
  creatureLevel: number,
  locationName: string,
  isWild: boolean
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You write 1 sentence battle encounter intros for a Harry Potter game.
Dramatic but brief. Pokemon style: "A wild X appeared!" but more magical.`,
        },
        {
          role: "user",
          content: `${isWild ? "Wild" : "Hostile"} ${creatureName} (level ${creatureLevel}) encountered in ${locationName}.`,
        },
      ],
      max_tokens: 50,
      temperature: 0.8,
    });

    return response.choices[0]?.message?.content?.trim() || 
      `A ${creatureName} blocks your path!`;
  } catch (error) {
    console.error("Error generating battle intro:", error);
    return `A ${creatureName} blocks your path!`;
  }
}

export async function generateBattleVictory(
  creatureName: string,
  experienceGained: number,
  playerName: string
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You write 1 sentence victory messages for a Harry Potter battle game.
Brief and triumphant. Mention experience gained.`,
        },
        {
          role: "user",
          content: `${playerName} defeated ${creatureName}. Gained ${experienceGained} XP.`,
        },
      ],
      max_tokens: 40,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content?.trim() || 
      `Victory! You defeated the ${creatureName} and earned ${experienceGained} experience.`;
  } catch (error) {
    console.error("Error generating victory message:", error);
    return `Victory! You defeated the ${creatureName} and earned ${experienceGained} experience.`;
  }
}

export async function generateStoryEvent(
  eventType: string,
  eventDescription: string,
  context: PlayerContext
): Promise<{ narration: string; choices?: string[] }> {
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You narrate brief story events in a Harry Potter game.
Output JSON: {"narration": "2-3 sentences", "choices": ["option1", "option2"] or null}
If the event requires a choice, provide 2 options. Otherwise, choices can be null.`,
        },
        {
          role: "user",
          content: `Event: ${eventType}
Description: ${eventDescription}
Player: ${context.playerName} (${context.house}, level ${context.level}) at ${context.currentLocation}`,
        },
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content?.trim() || "";
    
    try {
      const parsed = JSON.parse(content);
      return {
        narration: parsed.narration || "Something unexpected happens.",
        choices: parsed.choices || undefined,
      };
    } catch {
      return {
        narration: "Something catches your attention.",
      };
    }
  } catch (error) {
    console.error("Error generating story event:", error);
    return {
      narration: "Something catches your attention.",
    };
  }
}
