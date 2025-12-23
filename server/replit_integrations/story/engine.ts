import OpenAI from "openai";
import type { StoryArc, Chapter } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OLLAMA_API_KEY || "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "https://gpt.netsuite.tech/v1",
});

const SUMMARIZE_EVERY_N_DECISIONS = 10;

export async function generateStoryArc(playerName: string, house: string | null): Promise<StoryArc> {
  const houseTraits: Record<string, string> = {
    "Gryffindor": "brave and daring, often rushing headfirst into danger",
    "Slytherin": "cunning and ambitious, using clever means to achieve goals",
    "Ravenclaw": "wise and curious, solving problems through intellect",
    "Hufflepuff": "loyal and hardworking, finding strength in friendships"
  };

  const playerTrait = house ? houseTraits[house] : "discovering their own unique magical talents";

  const prompt = `You are a master storyteller creating an engaging adventure for a first-year Hogwarts student.

Create a compelling STORY ARC for ${playerName}${house ? ` of ${house}` : ''}, who is ${playerTrait}.

The story should be set during their first year at Hogwarts (1991-1992) and feature:
- A central mystery or conflict that drives the entire narrative
- Personal stakes that matter to an 11-year-old wizard
- Connections to the magical world of Harry Potter
- Opportunities for character growth and meaningful choices

You must respond with ONLY valid JSON in this exact format (no additional text):
{
  "title": "The [Compelling Title of the Adventure]",
  "premise": "[2-3 sentence hook describing the central conflict that will unfold]",
  "chapters": [
    {
      "title": "Chapter 1: [Title]",
      "objective": "[What must be accomplished in this chapter]",
      "keyEvents": ["[Event 1]", "[Event 2]", "[Event 3]"],
      "completed": false
    },
    {
      "title": "Chapter 2: [Title]",
      "objective": "[What must be accomplished]",
      "keyEvents": ["[Event 1]", "[Event 2]", "[Event 3]"],
      "completed": false
    },
    {
      "title": "Chapter 3: [Title]",
      "objective": "[What must be accomplished]",
      "keyEvents": ["[Event 1]", "[Event 2]", "[Event 3]"],
      "completed": false
    },
    {
      "title": "Chapter 4: [Title]",
      "objective": "[The climax and resolution]",
      "keyEvents": ["[Event 1]", "[Event 2]", "[Event 3]"],
      "completed": false
    }
  ],
  "currentChapterIndex": 0
}

Make the adventure unique, engaging, and appropriate for the Hogwarts setting. The mystery should be something a first-year could realistically encounter and solve.`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OLLAMA_MODEL || "qwen3-coder:30b",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content?.trim() || "";
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as StoryArc;
      return parsed;
    }

    return getDefaultStoryArc(playerName, house);
  } catch (error) {
    console.error("Error generating story arc:", error);
    return getDefaultStoryArc(playerName, house);
  }
}

function getDefaultStoryArc(playerName: string, house: string | null): StoryArc {
  return {
    title: "The Vanishing Portrait",
    premise: `Strange things are happening at Hogwarts. Portraits are going missing from the castle walls, and whispers speak of an ancient magic awakening. ${playerName} finds themselves drawn into a mystery that will test their courage and reveal secrets hidden for centuries.`,
    chapters: [
      {
        title: "Chapter 1: The First Vanishing",
        objective: "Discover that portraits are mysteriously disappearing and find a clue",
        keyEvents: [
          "Witness a portrait vanish before your eyes",
          "Meet a friendly ghost who hints at dark magic",
          "Find a strange symbol left behind"
        ],
        completed: false
      },
      {
        title: "Chapter 2: Forbidden Knowledge",
        objective: "Research the symbol and uncover its connection to Hogwarts history",
        keyEvents: [
          "Sneak into the Restricted Section",
          "Discover the legend of the Portrait Keeper",
          "A professor grows suspicious of your activities"
        ],
        completed: false
      },
      {
        title: "Chapter 3: The Hidden Chamber",
        objective: "Find the secret location where the portraits are being taken",
        keyEvents: [
          "Decode an ancient map",
          "Navigate through dangerous passages",
          "Confront an unexpected ally or enemy"
        ],
        completed: false
      },
      {
        title: "Chapter 4: Breaking the Spell",
        objective: "Rescue the trapped portrait souls and stop the ancient magic",
        keyEvents: [
          "Face the source of the dark magic",
          "Use everything you've learned",
          "Restore the portraits and save Hogwarts"
        ],
        completed: false
      }
    ],
    currentChapterIndex: 0
  };
}

export async function summarizeStory(
  messages: { role: string; content: string }[],
  storyArc: StoryArc,
  currentSummary: string | null
): Promise<string> {
  const currentChapter = storyArc.chapters[storyArc.currentChapterIndex];
  
  const recentMessages = messages
    .filter(m => m.role !== "system")
    .slice(-20)
    .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 500)}`)
    .join("\n\n---\n\n");

  const prompt = `You are summarizing an ongoing interactive story for context management.

STORY ARC: "${storyArc.title}"
${storyArc.premise}

CURRENT CHAPTER: ${currentChapter.title}
Objective: ${currentChapter.objective}

${currentSummary ? `PREVIOUS SUMMARY:\n${currentSummary}\n\n` : ''}

RECENT STORY EVENTS:
${recentMessages}

Create a comprehensive but concise NARRATIVE SUMMARY that:
1. Captures the protagonist's journey and key decisions made
2. Notes important characters encountered and relationships formed
3. Tracks significant items found or abilities discovered
4. Records current location and situation
5. Highlights progress toward chapter objectives
6. Preserves emotional beats and character development

Write in third person past tense, approximately 300-400 words. This summary will replace the detailed message history to keep the AI context manageable while preserving story continuity.

Start directly with the summary, no preamble:`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OLLAMA_MODEL || "qwen3-coder:30b",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600,
    });

    return response.choices[0]?.message?.content?.trim() || currentSummary || "The adventure continues...";
  } catch (error) {
    console.error("Error summarizing story:", error);
    return currentSummary || "The adventure continues...";
  }
}

export async function checkChapterProgress(
  storyArc: StoryArc,
  recentContent: string
): Promise<{ shouldAdvance: boolean; updatedArc: StoryArc }> {
  const currentChapter = storyArc.chapters[storyArc.currentChapterIndex];
  
  if (storyArc.currentChapterIndex >= storyArc.chapters.length - 1 && currentChapter.completed) {
    return { shouldAdvance: false, updatedArc: storyArc };
  }

  const prompt = `Analyze if the current chapter objective has been completed.

CHAPTER: ${currentChapter.title}
OBJECTIVE: ${currentChapter.objective}
KEY EVENTS EXPECTED: ${currentChapter.keyEvents.join(", ")}

RECENT STORY CONTENT:
${recentContent.slice(0, 1500)}

Has the chapter objective been substantially completed based on the story events? 
Respond with ONLY "YES" or "NO" (no explanation).`;

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OLLAMA_MODEL || "qwen3-coder:30b",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 10,
    });

    const answer = response.choices[0]?.message?.content?.trim().toUpperCase() || "NO";
    
    if (answer.includes("YES")) {
      const updatedArc = { ...storyArc };
      updatedArc.chapters = [...storyArc.chapters];
      updatedArc.chapters[storyArc.currentChapterIndex] = {
        ...currentChapter,
        completed: true
      };
      
      if (storyArc.currentChapterIndex < storyArc.chapters.length - 1) {
        updatedArc.currentChapterIndex = storyArc.currentChapterIndex + 1;
      }
      
      return { shouldAdvance: true, updatedArc };
    }
  } catch (error) {
    console.error("Error checking chapter progress:", error);
  }

  return { shouldAdvance: false, updatedArc: storyArc };
}

export function shouldSummarize(decisionCount: number, lastSummarizedAt: number): boolean {
  return (decisionCount - lastSummarizedAt) >= SUMMARIZE_EVERY_N_DECISIONS;
}

export function buildContextWithSummary(
  systemPrompt: string,
  storySummary: string | null,
  storyArc: StoryArc,
  recentMessages: { role: string; content: string }[]
): { role: "user" | "assistant" | "system"; content: string }[] {
  const currentChapter = storyArc.chapters[storyArc.currentChapterIndex];
  
  const arcContext = `
STORY ARC: "${storyArc.title}"
${storyArc.premise}

CURRENT CHAPTER: ${currentChapter.title}
Objective: ${currentChapter.objective}
Key events to work toward: ${currentChapter.keyEvents.filter((_, i) => i < 2).join(", ")}

${storyArc.currentChapterIndex > 0 ? `Completed chapters: ${storyArc.chapters.slice(0, storyArc.currentChapterIndex).map(c => c.title).join(", ")}` : ''}
`;

  const enhancedSystemPrompt = systemPrompt + "\n\n" + arcContext;

  const context: { role: "user" | "assistant" | "system"; content: string }[] = [
    { role: "system", content: enhancedSystemPrompt }
  ];

  if (storySummary) {
    context.push({
      role: "system",
      content: `STORY SO FAR (Summary of previous events):\n${storySummary}`
    });
  }

  const messagesToInclude = storySummary 
    ? recentMessages.slice(-6)
    : recentMessages.slice(-20);

  for (const msg of messagesToInclude) {
    if (msg.role !== "system") {
      context.push({
        role: msg.role as "user" | "assistant",
        content: msg.content
      });
    }
  }

  return context;
}
