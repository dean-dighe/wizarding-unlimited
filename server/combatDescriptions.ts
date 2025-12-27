/**
 * Dynamic Combat Description Generator
 * Uses AI micro-calls to generate flavorful Harry Potter-style combat descriptions
 * Includes caching and fallback text for reliability
 */

import OpenAI from "openai";

const client = new OpenAI({
  baseURL: process.env.OLLAMA_BASE_URL,
  apiKey: process.env.OLLAMA_API_KEY,
});

interface CombatContext {
  actorName: string;
  targetName: string;
  spellName: string;
  spellDisplayName: string;
  discipline: string;
  damage?: number;
  isCritical?: boolean;
  effectiveness?: "normal" | "super_effective" | "not_very_effective";
  statusApplied?: string;
  isMiss?: boolean;
  isHealing?: boolean;
  healAmount?: number;
  targetFainted?: boolean;
}

const descriptionCache = new Map<string, string>();
const CACHE_SIZE_LIMIT = 500;

function getCacheKey(context: CombatContext): string {
  return `${context.spellName}:${context.effectiveness || "normal"}:${context.isCritical ? "crit" : ""}:${context.isMiss ? "miss" : ""}:${context.statusApplied || ""}`;
}

function getBaseDescription(context: CombatContext): string {
  const { actorName, targetName, spellDisplayName, damage, isCritical, effectiveness, statusApplied, isMiss, isHealing, healAmount, targetFainted } = context;
  
  if (isMiss) {
    return `${actorName} cast ${spellDisplayName} but the spell missed its mark!`;
  }
  
  if (isHealing && healAmount) {
    return `${actorName} used ${spellDisplayName}! Restored ${healAmount} HP.`;
  }
  
  let message = `${actorName} cast ${spellDisplayName}!`;
  
  if (damage && damage > 0) {
    message += ` It dealt ${damage} damage to ${targetName}.`;
    
    if (isCritical) {
      message += " Critical strike!";
    }
    
    if (effectiveness === "super_effective") {
      message += " The magic proved especially potent!";
    } else if (effectiveness === "not_very_effective") {
      message += " The spell's power was diminished...";
    }
  }
  
  if (statusApplied) {
    message += ` ${targetName} is now ${statusApplied}!`;
  }
  
  if (targetFainted) {
    message += ` ${targetName} has been defeated!`;
  }
  
  return message;
}

const DISCIPLINE_FLAVOR: Record<string, string[]> = {
  charms: ["flickered with silvery light", "hummed with arcane energy", "sparkled through the air"],
  transfiguration: ["shifted reality around", "warped the very essence of", "transformed into pure force"],
  dark_arts: ["crackled with malevolent energy", "pulsed with shadowy power", "struck with cursed fury"],
  defense: ["blazed with protective fury", "channeled defensive wrath", "countered with righteous force"],
  potions: ["released alchemical vapor", "burst with volatile essence", "exploded in a cloud of reagents"],
  herbology: ["summoned nature's wrath", "unleashed verdant power", "wrapped in thorny vines"],
  creatures: ["called upon magical beasts", "channeled creature magic", "invoked primal forces"],
};

const CRITICAL_PHRASES = [
  "The spell struck true with devastating precision!",
  "A perfect cast found its mark!",
  "The magic surged with exceptional power!",
  "The incantation resonated with raw magical force!",
];

const SUPER_EFFECTIVE_PHRASES = [
  "The magical resonance amplified the spell's power!",
  "The target's weakness to this discipline was brutally exposed!",
  "The magic found its perfect counter!",
];

const NOT_EFFECTIVE_PHRASES = [
  "The target's magical resistance dampened the blow...",
  "The spell struggled against an opposing force...",
  "The magic dissipated partially upon contact...",
];

const MISS_PHRASES = [
  "The spell fizzled harmlessly past its intended target.",
  "A shimmer of magic traced an arc wide of the mark.",
  "The incantation faltered, the magic scattering into motes of light.",
];

function buildEnhancedDescription(context: CombatContext): string {
  const { actorName, targetName, spellDisplayName, discipline, damage, isCritical, effectiveness, statusApplied, isMiss, targetFainted } = context;
  
  if (isMiss) {
    const missPhrase = MISS_PHRASES[Math.floor(Math.random() * MISS_PHRASES.length)];
    return `${actorName} raised their wand and cast ${spellDisplayName}! ${missPhrase}`;
  }
  
  const flavorList = DISCIPLINE_FLAVOR[discipline] || DISCIPLINE_FLAVOR.charms;
  const flavor = flavorList[Math.floor(Math.random() * flavorList.length)];
  
  let desc = `${actorName}'s ${spellDisplayName} ${flavor}`;
  
  if (damage && damage > 0) {
    desc += `, dealing ${damage} damage to ${targetName}.`;
    
    if (isCritical) {
      const critPhrase = CRITICAL_PHRASES[Math.floor(Math.random() * CRITICAL_PHRASES.length)];
      desc += ` ${critPhrase}`;
    }
    
    if (effectiveness === "super_effective") {
      const effectivePhrase = SUPER_EFFECTIVE_PHRASES[Math.floor(Math.random() * SUPER_EFFECTIVE_PHRASES.length)];
      desc += ` ${effectivePhrase}`;
    } else if (effectiveness === "not_very_effective") {
      const notEffectivePhrase = NOT_EFFECTIVE_PHRASES[Math.floor(Math.random() * NOT_EFFECTIVE_PHRASES.length)];
      desc += ` ${notEffectivePhrase}`;
    }
  } else {
    desc += ".";
  }
  
  if (statusApplied) {
    desc += ` ${targetName} is now afflicted with ${statusApplied}!`;
  }
  
  if (targetFainted) {
    desc += ` ${targetName} collapses, unable to continue the duel!`;
  }
  
  return desc;
}

export async function generateCombatDescription(
  context: CombatContext,
  useAI: boolean = false,
  timeoutMs: number = 250
): Promise<string> {
  const cacheKey = getCacheKey(context);
  
  if (descriptionCache.has(cacheKey)) {
    const cached = descriptionCache.get(cacheKey)!;
    return cached
      .replace("{actor}", context.actorName)
      .replace("{target}", context.targetName)
      .replace("{spell}", context.spellDisplayName)
      .replace("{damage}", String(context.damage || 0));
  }
  
  const enhancedDesc = buildEnhancedDescription(context);
  
  if (!useAI) {
    return enhancedDesc;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const prompt = buildAIPrompt(context);
    
    const response = await client.chat.completions.create({
      model: process.env.OLLAMA_MODEL || "llama3.2",
      messages: [
        {
          role: "system",
          content: "You are a narrator for a Harry Potter magical combat game. Generate a single, vivid combat description in 1-2 sentences. Be dramatic but concise. Use magical vocabulary appropriate to the Wizarding World.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 60,
      temperature: 0.8,
    }, { signal: controller.signal });
    
    clearTimeout(timeoutId);
    
    const aiDescription = response.choices[0]?.message?.content?.trim();
    
    if (aiDescription && aiDescription.length > 20) {
      if (descriptionCache.size >= CACHE_SIZE_LIMIT) {
        const firstKey = descriptionCache.keys().next().value;
        if (firstKey) descriptionCache.delete(firstKey);
      }
      
      const templateVersion = aiDescription
        .replace(context.actorName, "{actor}")
        .replace(context.targetName, "{target}")
        .replace(context.spellDisplayName, "{spell}")
        .replace(String(context.damage), "{damage}");
      
      descriptionCache.set(cacheKey, templateVersion);
      
      return aiDescription;
    }
    
    return enhancedDesc;
  } catch (error) {
    return enhancedDesc;
  }
}

function buildAIPrompt(context: CombatContext): string {
  const { actorName, targetName, spellDisplayName, discipline, damage, isCritical, effectiveness, statusApplied, isMiss, targetFainted } = context;
  
  let prompt = `${actorName} casts ${spellDisplayName} (${discipline} magic) at ${targetName}.`;
  
  if (isMiss) {
    prompt += " The spell MISSES.";
  } else {
    if (damage) {
      prompt += ` Deals ${damage} damage.`;
    }
    if (isCritical) {
      prompt += " CRITICAL HIT!";
    }
    if (effectiveness === "super_effective") {
      prompt += " Super effective!";
    } else if (effectiveness === "not_very_effective") {
      prompt += " Not very effective.";
    }
    if (statusApplied) {
      prompt += ` Inflicts ${statusApplied}.`;
    }
    if (targetFainted) {
      prompt += ` ${targetName} is DEFEATED.`;
    }
  }
  
  prompt += "\n\nWrite a dramatic 1-2 sentence description:";
  
  return prompt;
}

export function clearDescriptionCache(): void {
  descriptionCache.clear();
}

export { type CombatContext };
