import OpenAI from "openai";
import { db } from "../../db";
import { spells, spell_animations, Spell, SpellAnimation, AnimationStatus, SpellColorTheme, SpellAnimationConfig } from "@shared/schema";
import { eq } from "drizzle-orm";
import { assetStorage } from "./storage";
import pLimit from "p-limit";

const xai = new OpenAI({
  baseURL: "https://api.x.ai/v1",
  apiKey: process.env.XAI_API_KEY,
});

const SPELL_ANIMATION_STYLE = `Spell effect sprite sheet for visual novel game:
- 4x2 grid layout (8 frames total, 256x128 pixels per frame)
- Magical spell effect on transparent/dark background
- Frame sequence: buildup (2 frames), cast (3 frames), dissipate (3 frames)
- Harry Potter magical aesthetic
- Glowing, ethereal magical energy
- Clean, high contrast for overlay compositing`;

export const HARRY_POTTER_SPELLS: Array<{
  name: string;
  incantation: string;
  classification: "charm" | "jinx" | "hex" | "curse" | "transfiguration" | "healing" | "defensive" | "utility" | "dark";
  description: string;
  effect: string;
  colorTheme: SpellColorTheme;
  difficulty: number;
  yearLearned: number;
  isUnforgivable?: boolean;
}> = [
  {
    name: "Lumos",
    incantation: "Lumos",
    classification: "charm",
    description: "Creates a beam of light from the wand tip",
    effect: "Bright white-gold light emanating from wand tip, growing orb of warm illumination",
    colorTheme: { primary: "#FFD700", secondary: "#FFFACD", particle: "#FFFFFF" },
    difficulty: 1,
    yearLearned: 1
  },
  {
    name: "Nox",
    incantation: "Nox",
    classification: "charm",
    description: "Extinguishes wand light",
    effect: "Light fading to darkness, shrinking orb of light dissolving into shadow",
    colorTheme: { primary: "#2F2F4F", secondary: "#1A1A2E", particle: "#4A4A6A" },
    difficulty: 1,
    yearLearned: 1
  },
  {
    name: "Wingardium Leviosa",
    incantation: "Wingardium Leviosa",
    classification: "charm",
    description: "Levitates objects",
    effect: "Swirling golden sparkles lifting upward, gentle floating motes of light",
    colorTheme: { primary: "#FFD700", secondary: "#FFA500", particle: "#FFFACD" },
    difficulty: 2,
    yearLearned: 1
  },
  {
    name: "Alohomora",
    incantation: "Alohomora",
    classification: "charm",
    description: "Unlocks doors and windows",
    effect: "Golden key-shaped burst of light, tumblers clicking open with sparkles",
    colorTheme: { primary: "#DAA520", secondary: "#FFD700", particle: "#B8860B" },
    difficulty: 2,
    yearLearned: 1
  },
  {
    name: "Reparo",
    incantation: "Reparo",
    classification: "charm",
    description: "Repairs broken objects",
    effect: "Blue-white threads of light weaving together, fragments reassembling",
    colorTheme: { primary: "#4169E1", secondary: "#87CEEB", particle: "#00BFFF" },
    difficulty: 2,
    yearLearned: 1
  },
  {
    name: "Incendio",
    incantation: "Incendio",
    classification: "charm",
    description: "Creates fire",
    effect: "Blazing orange-red flames erupting, fiery sparks and heat shimmer",
    colorTheme: { primary: "#FF4500", secondary: "#FF6347", particle: "#FFD700" },
    difficulty: 3,
    yearLearned: 1
  },
  {
    name: "Flipendo",
    incantation: "Flipendo",
    classification: "jinx",
    description: "Knocks back target",
    effect: "Blue-purple force wave pushing outward, concentric rings of energy",
    colorTheme: { primary: "#6A5ACD", secondary: "#9370DB", particle: "#E6E6FA" },
    difficulty: 2,
    yearLearned: 1
  },
  {
    name: "Expelliarmus",
    incantation: "Expelliarmus",
    classification: "charm",
    description: "Disarms opponent",
    effect: "Brilliant red-orange bolt of light, spiraling disarming energy",
    colorTheme: { primary: "#DC143C", secondary: "#FF6347", particle: "#FFD700" },
    difficulty: 3,
    yearLearned: 2
  },
  {
    name: "Rictusempra",
    incantation: "Rictusempra",
    classification: "charm",
    description: "Tickling charm",
    effect: "Silver bubbles and sparkles, playful swirling energy",
    colorTheme: { primary: "#C0C0C0", secondary: "#E8E8E8", particle: "#FFFAFA" },
    difficulty: 2,
    yearLearned: 2
  },
  {
    name: "Stupefy",
    incantation: "Stupefy",
    classification: "charm",
    description: "Stuns target",
    effect: "Bright red stunning bolt, crackling energy trail",
    colorTheme: { primary: "#FF0000", secondary: "#DC143C", particle: "#FF6B6B" },
    difficulty: 4,
    yearLearned: 3
  },
  {
    name: "Petrificus Totalus",
    incantation: "Petrificus Totalus",
    classification: "curse",
    description: "Full body-bind curse",
    effect: "Blue-white rigid energy waves, freezing crystalline effect",
    colorTheme: { primary: "#4682B4", secondary: "#87CEEB", particle: "#E0FFFF" },
    difficulty: 3,
    yearLearned: 1
  },
  {
    name: "Expecto Patronum",
    incantation: "Expecto Patronum",
    classification: "defensive",
    description: "Conjures a Patronus guardian",
    effect: "Brilliant silver-white ethereal animal form, radiant protective light",
    colorTheme: { primary: "#C0C0C0", secondary: "#E8F4F8", particle: "#FFFFFF" },
    difficulty: 8,
    yearLearned: 3
  },
  {
    name: "Riddikulus",
    incantation: "Riddikulus",
    classification: "charm",
    description: "Forces Boggart to assume amusing form",
    effect: "Rainbow sparkles transforming into comedic shapes, laughter energy",
    colorTheme: { primary: "#FF69B4", secondary: "#FFB6C1", particle: "#FFDAB9" },
    difficulty: 4,
    yearLearned: 3
  },
  {
    name: "Protego",
    incantation: "Protego",
    classification: "defensive",
    description: "Creates magical shield",
    effect: "Translucent blue shield barrier, shimmering protective dome",
    colorTheme: { primary: "#4169E1", secondary: "#87CEEB", particle: "#E0FFFF" },
    difficulty: 5,
    yearLearned: 4
  },
  {
    name: "Accio",
    incantation: "Accio",
    classification: "charm",
    description: "Summons objects",
    effect: "Golden pulling stream of light, object flying toward caster",
    colorTheme: { primary: "#FFD700", secondary: "#FFA500", particle: "#FFFACD" },
    difficulty: 4,
    yearLearned: 4
  },
  {
    name: "Aguamenti",
    incantation: "Aguamenti",
    classification: "charm",
    description: "Creates water from wand",
    effect: "Crystal clear water stream, splashing aqua droplets",
    colorTheme: { primary: "#00CED1", secondary: "#48D1CC", particle: "#AFEEEE" },
    difficulty: 3,
    yearLearned: 4
  },
  {
    name: "Lumos Maxima",
    incantation: "Lumos Maxima",
    classification: "charm",
    description: "Creates powerful light",
    effect: "Blinding white-gold explosion of light, intense illumination burst",
    colorTheme: { primary: "#FFFFFF", secondary: "#FFD700", particle: "#FFFACD" },
    difficulty: 3,
    yearLearned: 3
  },
  {
    name: "Obliviate",
    incantation: "Obliviate",
    classification: "charm",
    description: "Erases memories",
    effect: "Misty silver-white tendrils entering target's mind, fading memories",
    colorTheme: { primary: "#C0C0C0", secondary: "#D3D3D3", particle: "#E8E8E8" },
    difficulty: 6,
    yearLearned: 5
  },
  {
    name: "Confundo",
    incantation: "Confundo",
    classification: "charm",
    description: "Causes confusion",
    effect: "Swirling purple-blue mist, dizzy spiral patterns",
    colorTheme: { primary: "#9932CC", secondary: "#BA55D3", particle: "#DDA0DD" },
    difficulty: 5,
    yearLearned: 5
  },
  {
    name: "Impedimenta",
    incantation: "Impedimenta",
    classification: "jinx",
    description: "Slows or stops target",
    effect: "Turquoise energy wave, slowing time-like distortion",
    colorTheme: { primary: "#40E0D0", secondary: "#48D1CC", particle: "#AFEEEE" },
    difficulty: 4,
    yearLearned: 4
  },
  {
    name: "Reducto",
    incantation: "Reducto",
    classification: "curse",
    description: "Blasts solid objects apart",
    effect: "Explosive red-orange blast, debris flying outward",
    colorTheme: { primary: "#FF4500", secondary: "#FF6347", particle: "#FFA500" },
    difficulty: 5,
    yearLearned: 4
  },
  {
    name: "Diffindo",
    incantation: "Diffindo",
    classification: "charm",
    description: "Severing charm",
    effect: "Sharp blue cutting light, precise slicing energy",
    colorTheme: { primary: "#4169E1", secondary: "#1E90FF", particle: "#87CEEB" },
    difficulty: 3,
    yearLearned: 2
  },
  {
    name: "Silencio",
    incantation: "Silencio",
    classification: "charm",
    description: "Silences target",
    effect: "Transparent bubble of silence, muting wave",
    colorTheme: { primary: "#D3D3D3", secondary: "#C0C0C0", particle: "#A9A9A9" },
    difficulty: 3,
    yearLearned: 5
  },
  {
    name: "Episkey",
    incantation: "Episkey",
    classification: "healing",
    description: "Heals minor injuries",
    effect: "Warm green-gold healing glow, soothing energy",
    colorTheme: { primary: "#32CD32", secondary: "#90EE90", particle: "#98FB98" },
    difficulty: 3,
    yearLearned: 5
  },
  {
    name: "Scourgify",
    incantation: "Scourgify",
    classification: "utility",
    description: "Cleans objects",
    effect: "Sparkling blue cleaning bubbles, fresh cleansing mist",
    colorTheme: { primary: "#87CEEB", secondary: "#ADD8E6", particle: "#E0FFFF" },
    difficulty: 2,
    yearLearned: 1
  },
  {
    name: "Locomotor",
    incantation: "Locomotor",
    classification: "charm",
    description: "Moves objects",
    effect: "Golden levitation aura, floating guidance light",
    colorTheme: { primary: "#FFD700", secondary: "#FFA500", particle: "#FFFACD" },
    difficulty: 3,
    yearLearned: 3
  },
  {
    name: "Relashio",
    incantation: "Relashio",
    classification: "charm",
    description: "Forces release of grip",
    effect: "Bright sparks forcing release, electric burst",
    colorTheme: { primary: "#FFD700", secondary: "#FF6347", particle: "#FFA500" },
    difficulty: 3,
    yearLearned: 4
  },
  {
    name: "Finite Incantatem",
    incantation: "Finite Incantatem",
    classification: "charm",
    description: "Ends spell effects",
    effect: "White nullifying wave, spell-breaking ripple",
    colorTheme: { primary: "#FFFFFF", secondary: "#F5F5F5", particle: "#DCDCDC" },
    difficulty: 4,
    yearLearned: 2
  },
  {
    name: "Crucio",
    incantation: "Crucio",
    classification: "dark",
    description: "Cruciatus Curse - causes intense pain",
    effect: "Crackling red-black lightning, agonizing dark energy",
    colorTheme: { primary: "#8B0000", secondary: "#DC143C", particle: "#FF0000" },
    difficulty: 10,
    yearLearned: 7,
    isUnforgivable: true
  },
  {
    name: "Imperio",
    incantation: "Imperio",
    classification: "dark",
    description: "Imperius Curse - controls target",
    effect: "Ghostly green-white tendrils, mind-controlling mist",
    colorTheme: { primary: "#2E8B57", secondary: "#90EE90", particle: "#98FB98" },
    difficulty: 10,
    yearLearned: 7,
    isUnforgivable: true
  },
  {
    name: "Avada Kedavra",
    incantation: "Avada Kedavra",
    classification: "dark",
    description: "Killing Curse - causes instant death",
    effect: "Blinding green bolt of death, rushing roar of dark magic",
    colorTheme: { primary: "#00FF00", secondary: "#32CD32", particle: "#7FFF00" },
    difficulty: 10,
    yearLearned: 7,
    isUnforgivable: true
  },
  {
    name: "Sectumsempra",
    incantation: "Sectumsempra",
    classification: "dark",
    description: "Slashing curse causing deep wounds",
    effect: "Invisible slashing force, blood-red energy trails",
    colorTheme: { primary: "#8B0000", secondary: "#DC143C", particle: "#FF6347" },
    difficulty: 8,
    yearLearned: 6
  },
  {
    name: "Legilimens",
    incantation: "Legilimens",
    classification: "charm",
    description: "Reads target's mind",
    effect: "Probing silver tendrils, mind-connecting light",
    colorTheme: { primary: "#C0C0C0", secondary: "#D3D3D3", particle: "#E8E8E8" },
    difficulty: 7,
    yearLearned: 5
  },
  {
    name: "Serpensortia",
    incantation: "Serpensortia",
    classification: "transfiguration",
    description: "Conjures a snake",
    effect: "Dark green smoke forming serpent, slithering magical creation",
    colorTheme: { primary: "#2E8B57", secondary: "#228B22", particle: "#90EE90" },
    difficulty: 4,
    yearLearned: 2
  },
  {
    name: "Bombarda",
    incantation: "Bombarda",
    classification: "curse",
    description: "Causes small explosion",
    effect: "Orange-red explosion, fiery blast wave",
    colorTheme: { primary: "#FF4500", secondary: "#FF6347", particle: "#FFD700" },
    difficulty: 4,
    yearLearned: 3
  },
  {
    name: "Confringo",
    incantation: "Confringo",
    classification: "curse",
    description: "Blasting curse causing fiery explosion",
    effect: "Massive orange-red fiery explosion, burning debris",
    colorTheme: { primary: "#FF4500", secondary: "#DC143C", particle: "#FFD700" },
    difficulty: 6,
    yearLearned: 5
  },
  {
    name: "Sonorus",
    incantation: "Sonorus",
    classification: "charm",
    description: "Amplifies voice",
    effect: "Sound waves radiating outward, amplification rings",
    colorTheme: { primary: "#9370DB", secondary: "#BA55D3", particle: "#DDA0DD" },
    difficulty: 2,
    yearLearned: 4
  },
  {
    name: "Quietus",
    incantation: "Quietus",
    classification: "charm",
    description: "Returns voice to normal",
    effect: "Sound waves diminishing inward, quieting ripples",
    colorTheme: { primary: "#778899", secondary: "#B0C4DE", particle: "#D3D3D3" },
    difficulty: 2,
    yearLearned: 4
  },
  {
    name: "Descendo",
    incantation: "Descendo",
    classification: "charm",
    description: "Moves objects downward",
    effect: "Downward pushing golden light, sinking energy",
    colorTheme: { primary: "#DAA520", secondary: "#FFD700", particle: "#FFA500" },
    difficulty: 3,
    yearLearned: 3
  },
  {
    name: "Ascendio",
    incantation: "Ascendio",
    classification: "charm",
    description: "Propels caster upward",
    effect: "Upward burst of light, launching energy",
    colorTheme: { primary: "#87CEEB", secondary: "#ADD8E6", particle: "#E0FFFF" },
    difficulty: 4,
    yearLearned: 3
  },
  {
    name: "Engorgio",
    incantation: "Engorgio",
    classification: "transfiguration",
    description: "Enlarges objects",
    effect: "Expanding golden glow, growing magical aura",
    colorTheme: { primary: "#FFD700", secondary: "#FFA500", particle: "#FFFACD" },
    difficulty: 3,
    yearLearned: 2
  },
  {
    name: "Reducio",
    incantation: "Reducio",
    classification: "transfiguration",
    description: "Shrinks objects",
    effect: "Shrinking blue glow, contracting magical aura",
    colorTheme: { primary: "#4169E1", secondary: "#6495ED", particle: "#87CEEB" },
    difficulty: 3,
    yearLearned: 2
  },
  {
    name: "Aparecium",
    incantation: "Aparecium",
    classification: "charm",
    description: "Reveals invisible ink",
    effect: "Revealing white light, hidden text appearing",
    colorTheme: { primary: "#FFFFFF", secondary: "#F5F5F5", particle: "#FFFAFA" },
    difficulty: 3,
    yearLearned: 2
  },
  {
    name: "Colloportus",
    incantation: "Colloportus",
    classification: "charm",
    description: "Locks doors",
    effect: "Blue locking energy, sealing magical barrier",
    colorTheme: { primary: "#4682B4", secondary: "#5F9EA0", particle: "#87CEEB" },
    difficulty: 3,
    yearLearned: 5
  },
  {
    name: "Immobulus",
    incantation: "Immobulus",
    classification: "charm",
    description: "Immobilizes living targets",
    effect: "Freezing blue-white energy, crystallizing effect",
    colorTheme: { primary: "#00BFFF", secondary: "#87CEEB", particle: "#E0FFFF" },
    difficulty: 4,
    yearLearned: 2
  },
  {
    name: "Depulso",
    incantation: "Depulso",
    classification: "charm",
    description: "Pushes objects away",
    effect: "Blue-purple repelling wave, pushing force field",
    colorTheme: { primary: "#6A5ACD", secondary: "#7B68EE", particle: "#9370DB" },
    difficulty: 3,
    yearLearned: 4
  },
  {
    name: "Arresto Momentum",
    incantation: "Arresto Momentum",
    classification: "charm",
    description: "Slows falling objects/people",
    effect: "Time-slowing blue distortion, cushioning energy",
    colorTheme: { primary: "#00CED1", secondary: "#20B2AA", particle: "#AFEEEE" },
    difficulty: 5,
    yearLearned: 3
  },
  {
    name: "Incarcerous",
    incantation: "Incarcerous",
    classification: "curse",
    description: "Binds target with ropes",
    effect: "Brown-gold ropes materializing, binding magical cords",
    colorTheme: { primary: "#8B4513", secondary: "#A0522D", particle: "#D2691E" },
    difficulty: 5,
    yearLearned: 5
  },
  {
    name: "Avis",
    incantation: "Avis",
    classification: "transfiguration",
    description: "Conjures flock of birds",
    effect: "Birds materializing from wand tip, fluttering magical creatures",
    colorTheme: { primary: "#FFD700", secondary: "#FFA500", particle: "#FFFACD" },
    difficulty: 4,
    yearLearned: 4
  },
  {
    name: "Oppugno",
    incantation: "Oppugno",
    classification: "jinx",
    description: "Commands conjured creatures to attack",
    effect: "Red commanding energy, aggressive directing force",
    colorTheme: { primary: "#DC143C", secondary: "#FF4500", particle: "#FF6347" },
    difficulty: 5,
    yearLearned: 5
  }
];

export class SpellAnimationService {
  async getOrCreateSpell(spellName: string): Promise<Spell | null> {
    const normalized = this.normalizeSpellName(spellName);
    
    const existing = await db.select().from(spells).where(eq(spells.spellName, normalized)).limit(1);
    if (existing.length > 0) {
      return existing[0];
    }

    const knownSpell = HARRY_POTTER_SPELLS.find(s => 
      this.normalizeSpellName(s.name) === normalized || 
      this.normalizeSpellName(s.incantation) === normalized
    );

    if (knownSpell) {
      const [inserted] = await db.insert(spells).values({
        spellName: knownSpell.name,
        incantation: knownSpell.incantation,
        classification: knownSpell.classification,
        description: knownSpell.description,
        effect: knownSpell.effect,
        colorTheme: knownSpell.colorTheme,
        difficulty: knownSpell.difficulty,
        yearLearned: knownSpell.yearLearned,
        isUnforgivable: knownSpell.isUnforgivable || false,
      }).returning();
      return inserted;
    }

    return null;
  }

  async getSpellAnimation(spellName: string): Promise<SpellAnimation | null> {
    const normalized = this.normalizeSpellName(spellName);
    const existing = await db.select().from(spell_animations).where(eq(spell_animations.spellName, normalized)).limit(1);
    return existing.length > 0 ? existing[0] : null;
  }

  async generateSpellAnimation(spellName: string): Promise<SpellAnimation> {
    const normalized = this.normalizeSpellName(spellName);
    console.log(`[SpellAnimation] Starting generation for: ${normalized}`);

    let spell = await this.getOrCreateSpell(spellName);
    
    let existing = await this.getSpellAnimation(normalized);
    if (existing && existing.generationStatus === "ready") {
      console.log(`[SpellAnimation] Already exists and ready: ${normalized}`);
      return existing;
    }
    
    if (existing && existing.generationStatus === "generating") {
      console.log(`[SpellAnimation] Already generating: ${normalized}`);
      return existing;
    }

    if (!existing) {
      const [created] = await db.insert(spell_animations).values({
        spellName: normalized,
        generationStatus: "generating",
      }).returning();
      existing = created;
    } else {
      await db.update(spell_animations)
        .set({ generationStatus: "generating", generationError: null })
        .where(eq(spell_animations.spellName, normalized));
      existing = { ...existing, generationStatus: "generating" as AnimationStatus };
    }

    this.generateAnimationAsync(normalized, spell).catch(err => {
      console.error(`[SpellAnimation] Async generation failed for ${normalized}:`, err);
    });

    return existing;
  }

  private async generateAnimationAsync(spellName: string, spell: Spell | null): Promise<void> {
    try {
      console.log(`[SpellAnimation] Generating sprite sheet for: ${spellName}`);

      const effectDescription = spell?.effect || `Magical spell effect called ${spellName}`;
      const colors = spell?.colorTheme || { primary: "#FFD700", secondary: "#FFFACD", particle: "#FFFFFF" };

      const prompt = `${SPELL_ANIMATION_STYLE}

Spell: ${spellName}
Effect: ${effectDescription}
Colors: Primary ${colors.primary}, Secondary glow ${colors.secondary}

Create a sprite sheet showing the spell effect animation sequence in 4x2 grid format.`;

      console.log(`[SpellAnimation] Calling xAI API for: ${spellName}`);
      const response = await Promise.race([
        xai.images.generate({
          model: "grok-2-image-1212",
          prompt: prompt.slice(0, 1000),
          n: 1,
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("Image generation timeout")), 60000)
        )
      ]);

      const imageData = response.data?.[0];
      if (!imageData) {
        throw new Error("No image data in response");
      }

      let imageBuffer: Buffer;
      if (imageData.b64_json) {
        imageBuffer = Buffer.from(imageData.b64_json, "base64");
      } else if (imageData.url) {
        console.log(`[SpellAnimation] Downloading from URL for: ${spellName}`);
        const imageResponse = await fetch(imageData.url);
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.statusText}`);
        }
        imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      } else {
        throw new Error("No image data (b64 or URL) in response");
      }

      console.log(`[SpellAnimation] Uploading to storage for: ${spellName}`);
      const imageUrl = await assetStorage.uploadSpellAnimation(spellName, imageBuffer);

      const animationConfig: SpellAnimationConfig = {
        frameWidth: 256,
        frameHeight: 128,
        frameCount: 8,
        frameRate: 12,
        loop: false,
        phases: {
          setup: { start: 0, end: 1 },
          cast: { start: 2, end: 4 },
          impact: { start: 5, end: 7 }
        }
      };

      await db.update(spell_animations)
        .set({
          spriteSheetUrl: imageUrl,
          animationConfig,
          promptUsed: prompt.slice(0, 500),
          generationStatus: "ready",
          generationError: null,
          updatedAt: new Date(),
        })
        .where(eq(spell_animations.spellName, spellName));

      console.log(`[SpellAnimation] Generation complete for: ${spellName}`);

    } catch (error) {
      console.error(`[SpellAnimation] Generation failed for ${spellName}:`, error);
      await db.update(spell_animations)
        .set({
          generationStatus: "failed",
          generationError: error instanceof Error ? error.message : "Unknown error",
          updatedAt: new Date(),
        })
        .where(eq(spell_animations.spellName, spellName));
    }
  }

  async pregenerateAllSpells(concurrency: number = 2): Promise<{ started: number; skipped: number }> {
    let started = 0;
    let skipped = 0;
    
    const limit = pLimit(concurrency);
    
    const tasks = HARRY_POTTER_SPELLS.map(spell => 
      limit(async () => {
        const existing = await this.getSpellAnimation(spell.name);
        if (existing && (existing.generationStatus === "ready" || existing.generationStatus === "generating")) {
          skipped++;
          return;
        }
        
        await this.generateSpellAnimation(spell.name);
        started++;
      })
    );
    
    await Promise.all(tasks);
    
    return { started, skipped };
  }

  async getAllSpellAnimationsStatus(): Promise<Array<{ name: string; status: AnimationStatus; hasAnimation: boolean }>> {
    const allAnimations = await db.select().from(spell_animations);
    const animationMap = new Map(allAnimations.map(a => [a.spellName, a]));
    
    return HARRY_POTTER_SPELLS.map(spell => {
      const animation = animationMap.get(spell.name);
      return {
        name: spell.name,
        status: animation?.generationStatus || "pending",
        hasAnimation: animation?.generationStatus === "ready" && !!animation.spriteSheetUrl
      };
    });
  }

  private normalizeSpellName(name: string): string {
    return name.trim().split(/\s+/).map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(" ");
  }

  getSpellColorTheme(spellName: string): SpellColorTheme {
    const normalized = this.normalizeSpellName(spellName);
    const knownSpell = HARRY_POTTER_SPELLS.find(s => s.name === normalized);
    return knownSpell?.colorTheme || { primary: "#FFD700", secondary: "#FFFACD", particle: "#FFFFFF" };
  }
}

export const spellAnimationService = new SpellAnimationService();
