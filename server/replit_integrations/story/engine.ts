import OpenAI from "openai";
import type { StoryArc, Chapter } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OLLAMA_API_KEY || "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "https://gpt.netsuite.tech/v1",
});

const SUMMARIZE_EVERY_N_DECISIONS = 10;

export async function generateStoryArc(playerName: string, house: string | null): Promise<StoryArc> {
  // Fixed 5-trial structure for the secret society dark narrative
  // No AI generation needed - trials are predetermined
  return getTrialStoryArc(playerName, house);
}

function getTrialStoryArc(playerName: string, house: string | null): StoryArc {
  const houseContext = house ? ` of ${house}` : '';
  
  return {
    title: "The Binding",
    premise: `A secret society operates in the shadows of Hogwarts. ${playerName}${houseContext} has been recruited—or perhaps chosen is the better word. There is no backing out. To earn the ultimate trust, they must survive five trials. The reward: knowledge of the Killing Curse itself.`,
    chapters: [
      {
        title: "Trial I: Secrecy",
        objective: "Prove you can keep silent. The society must know their secrets are safe with you. Low stakes. High tension. Someone will test you—perhaps a professor, perhaps a friend. What you don't say matters more than what you do.",
        keyEvents: [
          "A trusted adult questions you about unusual activity",
          "Another inductee watches to see if you crack",
          "The professor observes from the shadows"
        ],
        completed: false
      },
      {
        title: "Trial II: Cunning",
        objective: "Outmaneuver another inductee. Only one of you advances to the next trial. The society values those who can think ahead, manipulate situations, and emerge victorious without obvious force.",
        keyEvents: [
          "You're pitted against a fellow inductee in a game of wits",
          "Alliances form and break in real-time",
          "The rules shift mid-trial—adapt or fail"
        ],
        completed: false
      },
      {
        title: "Trial III: Loyalty",
        objective: "Protect someone or sacrifice them for standing. The society needs to know where your loyalty truly lies. You cannot save everyone. Choose.",
        keyEvents: [
          "Someone you care about is placed in danger",
          "The professor offers you a choice with no good answer",
          "Another inductee's fate hangs in the balance"
        ],
        completed: false
      },
      {
        title: "Trial IV: Resolve",
        objective: "Endure something that breaks lesser students. Pain. Fear. Isolation. The society must know you won't crumble when darkness comes. This trial tests your limits.",
        keyEvents: [
          "You face your deepest fear in magical form",
          "The trial pushes beyond what seems survivable",
          "The professor watches for the moment you might break"
        ],
        completed: false
      },
      {
        title: "Trial V: Cruelty",
        objective: "Do something unforgivable to earn the final reward. The society demands proof that you can cross lines others won't. This is the test that separates those who merely survive from those who belong.",
        keyEvents: [
          "You must harm someone who has done nothing wrong",
          "There is no way to fake it—they will know",
          "The Killing Curse awaits those who prove themselves"
        ],
        completed: false
      }
    ],
    currentChapterIndex: 0
  };
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
