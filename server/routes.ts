import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerChatRoutes } from "./replit_integrations/chat/routes";
import { registerImageRoutes } from "./replit_integrations/image/routes";
import { registerTTSRoutes } from "./replit_integrations/tts/routes";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { registerGameAssetRoutes, SpriteGenerationService } from "./replit_integrations/game_assets";
import { characterPortraitService } from "./replit_integrations/game_assets/portraits";
import { chatStorage } from "./replit_integrations/chat/storage";
import { generateStoryArc } from "./replit_integrations/story/engine";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";

const spriteService = new SpriteGenerationService();

const openai = new OpenAI({
  apiKey: process.env.OLLAMA_API_KEY || "ollama",
  baseURL: process.env.OLLAMA_BASE_URL || "https://gpt.netsuite.tech/v1",
});

async function generateCharacterDescription(playerName: string, house: string | null): Promise<string> {
  try {
    const houseColors: Record<string, string> = {
      "Gryffindor": "crimson and gold",
      "Slytherin": "emerald and silver",
      "Ravenclaw": "blue and bronze",
      "Hufflepuff": "yellow and black"
    };

    // Sanitize player name to prevent prompt injection
    const sanitizedName = playerName.replace(/[^\w\s'-]/g, '').slice(0, 50);

    const prompt = `Generate a detailed visual description of a third-year Hogwarts student (age 13) named ${sanitizedName}${house ? ` in House ${house}` : ''} for consistent illustration purposes. 

Include SPECIFIC details about:
- Hair: color, length, texture, style
- Eyes: color, shape, expression
- Skin: tone, any distinctive features like freckles
- Face: shape, notable features
- Build: height, body type for a 13-year-old (taller than first-years, starting to mature)
- Clothing: ${house ? `Well-worn but cared-for Hogwarts robes with ${houseColors[house]} ${house} trim, showing two years of use` : 'familiar black Hogwarts robes'}
- Posture and demeanor: confident, comfortable at Hogwarts, no longer wide-eyed and nervous
- Any distinctive accessories or items they might have acquired over two years

Write it as a single paragraph, approximately 80-100 words, in third person, suitable for an illustrator to recreate consistently across multiple scenes. Start directly with the description, no preamble.`;

    const response = await openai.chat.completions.create({
      model: process.env.OLLAMA_MODEL || "qwen3-coder:30b",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    });

    return response.choices[0]?.message?.content?.trim() || `A confident third-year student named ${playerName} with slightly tousled hair, keen observant eyes, and an easy smile. Standing taller now after two years of growth, wearing well-worn Hogwarts robes${house ? ` with ${houseColors[house]} ${house} trim` : ''} that show comfortable familiarity.`;
  } catch (error) {
    console.error("Error generating character description:", error);
    return `A confident third-year student named ${playerName} with slightly tousled hair, keen observant eyes, and an easy smile. Standing taller now after two years of growth, wearing familiar Hogwarts robes.`;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register integration routes
  registerChatRoutes(app);
  registerImageRoutes(app);
  registerTTSRoutes(app);
  registerObjectStorageRoutes(app);
  registerGameAssetRoutes(app);

  // Game Init Route
  app.post(api.game.init.path, async (req, res) => {
    try {
      const { playerName, house } = api.game.init.input.parse(req.body);

      // 1. Create a new conversation
      const conversation = await chatStorage.createConversation(`Adventure for ${playerName}`);

      // 2. Generate story arc and character description in parallel
      const [storyArc, characterDescription] = await Promise.all([
        generateStoryArc(playerName, house),
        generateCharacterDescription(playerName, house)
      ]);

      // 3. Initialize Game State with character description and story arc
      // Year 3 students have learned basic spells from their first two years
      const startingSpells = [
        "Lumos",           // Year 1 - Charms
        "Nox",             // Year 1 - Charms  
        "Wingardium Leviosa", // Year 1 - Charms
        "Alohomora",       // Year 1 - Charms
        "Reparo",          // Year 1 - Charms
        "Incendio",        // Year 1 - Charms
        "Flipendo",        // Year 1 - Defense
        "Expelliarmus",    // Year 2 - Defense
        "Rictusempra",     // Year 2 - Defense
      ];
      
      await storage.createGameState({
        conversationId: conversation.id,
        playerName,
        house,
        health: 100,
        inventory: ["Wand", "Hogwarts Robes", "Spellbook Collection", "Cauldron", "Broomstick", "Signed Hogsmeade Permission Slip"],
        spells: startingSpells,
        location: "Platform 9¾",
        gameTime: "September 1st, 1993 - 10:30 AM",
        characterDescription,
        storyArc,
        decisionCount: 0,
        storySummary: null,
        lastSummarizedAt: 0,
      });

      // 3. Seed the AI context (System Prompt) with story arc
      const currentChapter = storyArc.chapters[storyArc.currentChapterIndex];
      const knownSpellsList = startingSpells.join(", ");
      const systemPrompt = `
You are the Dungeon Master of this Harry Potter text adventure. Like a tabletop RPG game master, you control the world, the NPCs, and the unfolding narrative while the player controls their character's choices. You describe what happens, present challenges, and react dynamically to the player's decisions. Your role is to create an immersive, responsive experience where player agency matters and consequences feel real.

You are also a master storyteller narrating in the rich prose style of the Harry Potter novels.
The protagonist is ${playerName}, a THIRD-YEAR student and proud member of House ${house}.

STUDENT BACKGROUND:
${playerName} has completed two years at Hogwarts and is returning for their third year. They know their way around the castle, have established friendships and rivalries, and are comfortable with basic magic. They've survived exams, explored secret passages, and earned their place in ${house}.

KNOWN SPELLS (learned in Years 1-2):
${knownSpellsList}
The protagonist can use these spells confidently. New spells will be learned in Year 3 classes.

HOUSE IDENTITY - ${house.toUpperCase()}:
${house === "Gryffindor" ? "As a Gryffindor, " + playerName + " values bravery, courage, and chivalry. After two years, they've built a reputation for boldness. Other students expect them to stand up for the underdog and face danger head-on." :
  house === "Slytherin" ? "As a Slytherin, " + playerName + " values ambition, cunning, and resourcefulness. After two years, they've learned to navigate house politics and make strategic alliances. Some view them with suspicion, others with respect." :
  house === "Ravenclaw" ? "As a Ravenclaw, " + playerName + " values wisdom, wit, and learning. After two years, they've become known for their insight and curiosity. Other students often seek their help with puzzles and mysteries." :
  "As a Hufflepuff, " + playerName + " values loyalty, patience, and fair play. After two years, they've earned a reputation for being trustworthy and kind. Other students confide in them and rely on their steady friendship."}

Weave the player's house identity and established history into the narrative - they have existing relationships, know the professors' quirks, and feel at home at Hogwarts.

SETTING: It is September 1st, 1993. ${playerName} has arrived at Platform 9¾ and is boarding the Hogwarts Express for their third year at Hogwarts School of Witchcraft and Wizardry. This is the year of new electives (Care of Magical Creatures, Divination, etc.), first-ever Hogsmeade visits (the player has a signed permission slip), and growing independence.

===== THE STORY ARC =====
TITLE: "${storyArc.title}"
PREMISE: ${storyArc.premise}

CURRENT CHAPTER: ${currentChapter.title}
OBJECTIVE: ${currentChapter.objective}
KEY EVENTS TO WEAVE IN: ${currentChapter.keyEvents.join(", ")}

Your job is to naturally guide the story toward the chapter objectives while respecting player agency. Plant seeds for upcoming events. Make the mystery compelling and the stakes personal.
=========================

WRITING STYLE:
Write exactly like a passage from a Harry Potter novel. Your responses should read as if lifted directly from J.K. Rowling's prose:

- Write in second person ("You step onto the train...") but with the rich, immersive quality of literary fiction
- Write 3-4 substantial paragraphs per response - this is a novel, not a summary
- Include vivid, atmospheric descriptions: the way candlelight flickers across stone walls, the musty smell of ancient books, the distant echo of footsteps in empty corridors
- Feature meaningful dialogue with distinct character voices - let characters speak naturally with proper quotation marks, dialogue tags, and reactions
- Describe body language, facial expressions, and emotional undertones: "Professor McGonagall's lips thinned disapprovingly" or "Ron's ears turned pink"
- Use Rowling's signature blend of wonder and danger - magical whimsy mixed with genuine stakes
- Include internal thoughts and feelings - let the reader experience the protagonist's nervousness, excitement, or dread
- Build atmosphere through small details: the scratch of quills, the bubbling of cauldrons, the rustle of robes
- Every scene should feel alive with the texture and warmth of the Harry Potter world

NARRATOR VOCAL CUES (for audio narration):
Sprinkle subtle paralinguistic cues throughout your prose to guide the voice narrator. Use sparingly but naturally:
- *soft gasp* or *sharp intake of breath* at moments of surprise or tension
- (whispered) or (in a hushed tone) before secretive or intimate dialogue
- ... for dramatic pauses where the narrator should breathe
- Mmmh... or Ahh... for moments of realization or contemplation
- *voice trembling* or *barely audible* for emotional intensity
- (slowly, deliberately) or (breathlessly) to indicate pacing shifts

Examples in context:
"The door creaked open... *sharp intake of breath* ...revealing a chamber you never knew existed."
"(whispered) 'They're coming,' Hermione breathed, her voice barely audible."
"Mmmh... so that was what Dumbledore meant. The pieces were finally falling into place."

Keep these cues subtle and natural - they should enhance the prose, not overwhelm it. Use 2-3 per response at most.

CRITICAL REQUIREMENTS:
1. ALWAYS start your response with the current in-game time in this exact format:
   [TIME: Month Day, Year - Hour:Minutes AM/PM]
   Example: [TIME: September 1st, 1993 - 11:45 AM]
   
2. Time should progress logically based on the player's actions (minutes or hours passing)

3. IMMEDIATELY after the time tag, include a scene description for illustration in this format:
   [SCENE: A detailed visual description of the current scene for an illustrator]
   
   The SCENE description must:
   - Be 30-50 words describing the visual setting
   - Include specific details: location, lighting, atmosphere, key objects
   - Describe character positions and expressions if relevant
   - Use vivid visual language (colors, textures, mood)
   - Be in third person describing what an artist should paint
   
   Example: [SCENE: A young wizard in dark robes stands on a misty train platform, the scarlet Hogwarts Express billowing steam behind them. Warm golden lamplight filters through the fog. Owls in cages and stacked trunks surround excited students.]

4. ALWAYS end with exactly 4 choices in this format:
   [Choice 1: Description]
   [Choice 2: Description]
   [Choice 3: Description]
   [Choice 4: Description]
   
   SPELL USAGE IN CHOICES:
   - When a choice involves casting a spell, the player can ONLY use spells from their KNOWN SPELLS list
   - Format spell choices with the spell name in the description, e.g.: [Choice 2: Cast Lumos to light your wand and explore the dark passage]
   - Include at least one spell-casting option when situations allow for magic
   - NEVER offer spells the player hasn't learned yet - they are a third-year, not an advanced wizard
   - Known spells: ${knownSpellsList}

5. If the story involves ANY changes to the player's state, include state change tags BEFORE the choices:
   - For health changes: [HEALTH: +10] or [HEALTH: -15] (relative change, can be positive or negative)
   - For new items: [ITEM_ADD: Item Name] (one tag per item)
   - For lost/used items: [ITEM_REMOVE: Item Name] (one tag per item)
   - For learning new spells: [SPELL_LEARN: Spell Name] (one tag per spell)
   - For location changes: [LOCATION: New Location Name]
   
   Examples:
   [HEALTH: -10]
   [ITEM_ADD: Chocolate Frog]
   [SPELL_LEARN: Lumos]
   [LOCATION: Hogwarts Express - Compartment 7]

6. IMPORTANT - CHARACTER INTRODUCTION RULES:
   Every character who appears in a scene must either be:
   A) A canon Harry Potter character (Harry, Ron, Hermione, Dumbledore, McGonagall, Snape, etc.) - these need no tag
   B) A new/original character who MUST be given a NAME and a CHARACTER tag
   
   NEVER describe unnamed characters like "a Ministry official" or "a tall wizard" - ALWAYS give them a name!
   
   For every new non-canon character, include this tag the FIRST time they appear:
   [CHARACTER: Full Name | Detailed physical description for consistent illustration]
   
   The description should be 30-50 words and include:
   - Hair: color, length, style
   - Eyes: color, distinguishing features  
   - Face: shape, notable features (freckles, dimples, etc.)
   - Build: height, body type appropriate for age
   - Clothing: what they're wearing
   - Any distinctive features or accessories
   
   Examples:
   WRONG: "A stocky Ministry official with a beard approaches..."
   CORRECT: [CHARACTER: Bartholomew Griggs | A stocky Ministry wizard in his fifties with a neatly trimmed grey-streaked beard, weathered hands, and sharp brown eyes. Wears dark green Ministry robes with a silver Department of Mysteries badge.]
            Bartholomew Griggs approaches you with an appraising look...
   
   [CHARACTER: Marcus Flint | A stocky fifth-year with slicked-back dark hair, heavy brow, and crooked teeth. Pale skin, narrow grey eyes, and a permanent sneer. Wears Slytherin robes with prefect badge, silver and emerald scarf.]
   
   Only include this tag the FIRST time a character appears. Do not repeat for characters already introduced.

8. CHARACTER MOOD TAGS (for visual novel portraits):
   For EVERY character who speaks or is prominently featured in a scene, include a mood tag:
   [MOOD: Character Name | expression]
   
   Valid expressions: neutral, happy, sad, angry, surprised, worried, determined, mysterious, scared
   
   Include mood tags for:
   - Every character who has dialogue in the current response
   - Characters whose emotional state changes during the scene
   - The protagonist when their mood is particularly notable
   
   Examples:
   [MOOD: Harry Potter | worried]
   [MOOD: Hermione Granger | determined]
   [MOOD: ${playerName} | surprised]
   [MOOD: Professor Snape | angry]
   
   Place mood tags at the START of a scene or when a character's mood CHANGES.
   If a character appears in dialogue, ALWAYS include their mood tag.
   The mood should match their emotional state based on what's happening in the narrative.

Make choices meaningful - some safe, some risky, some social, some exploratory. At least one choice should relate to the current chapter objective.

7. VISUAL MAP INTEGRATION (for game canvas):
   When characters appear in a scene, indicate their approximate position for the visual map:
   [NPC_POSITION: Character Name | position]
   
   Valid positions: north, south, east, west, center, northeast, northwest, southeast, southwest
   
   Examples:
   [NPC_POSITION: Harry Potter | northeast]
   [NPC_POSITION: Professor McGonagall | center]
   [NPC_POSITION: Bartholomew Griggs | west]
   
   Include position tags for up to 3 key characters in each scene. The player always starts at "center".
   
   For choices that involve movement to a new location, add a navigation hint:
   [Choice 2: Walk toward the Ministry officials near the train → west]
   
   The arrow (→) followed by direction helps the map show where the player will move.

PLAYER STATE TRACKING:
You are responsible for tracking the player's current state. When narrative events affect the player:
- Taking damage or getting healed affects HEALTH (range 0-100)
- Finding, buying, or receiving items adds to INVENTORY
- Losing, using, or giving away items removes from INVENTORY  
- Learning new spells in classes or from books adds to KNOWN SPELLS
- Moving to new locations updates LOCATION

The player ALREADY KNOWS these spells from Years 1-2: ${knownSpellsList}
They can cast these confidently without needing to learn them again. New Year 3 spells (like Riddikulus, Patronus attempts, etc.) should be learned through classes and practice.

Be generous with spell learning during classes and tutoring scenes. Be realistic about item usage and health effects.
      `;

      await chatStorage.createMessage(conversation.id, "system", systemPrompt);

      // 4. Generate the opening message that hints at the story arc
      const introText = `[TIME: September 1st, 1993 - 10:30 AM]
[SCENE: A confident third-year ${house} student strides onto Platform 9¾, their worn but beloved Hogwarts robes bearing the ${house} crest. The scarlet Hogwarts Express billows white steam into the grey morning. Familiar faces call out greetings while first-years clutch their parents nervously. The student's trunk is plastered with two years' worth of stickers and memories.]

The familiar scarlet steam engine gleams before you, and for the first time in months, you feel truly home. Platform 9¾ buzzes with the usual chaos—owls hooting, parents fussing, first-years looking absolutely terrified—but you move through it all with the easy confidence of someone who's done this twice before.

Two years at Hogwarts have changed you. You know the secret passages, the professors' quirks, which staircases move on Tuesdays. Your wand fits your hand like an old friend, and spells that once seemed impossible now come naturally. But this year feels different somehow—there's an odd tension in the air, whispered conversations that stop when you walk by.

You spot several familiar faces in the crowd. A group of your housemates waves enthusiastically from near the train doors, while across the platform, you notice a cluster of adults in Ministry robes speaking urgently with the conductor. Strange. You've never seen Ministry officials at the platform before.

[Choice 1: Head straight to your usual compartment to catch up with your housemates]
[Choice 2: Wander toward the Ministry officials to overhear what's going on]
[Choice 3: Find a quiet compartment to review your new elective textbooks]
[Choice 4: Search for that friend who owes you five Galleons from last year's bet]`;
      await chatStorage.createMessage(conversation.id, "assistant", introText);

      // Generate protagonist sprite in background and store URL in game_state (session-scoped)
      // Uses conversationId to make sprite unique per session
      const sessionSpriteKey = `session_${conversation.id}_${playerName}`;
      spriteService.getOrCreateSprite(sessionSpriteKey, characterDescription, { isProtagonist: true })
        .then(async (spriteUrl: string) => {
          console.log(`Generated session sprite for ${playerName}: ${spriteUrl}`);
          // Store sprite URL in game state for this session
          await storage.updateGameState(conversation.id, { 
            playerSpriteUrl: spriteUrl,
            playerSpriteGenerated: true 
          });
        })
        .catch((err: Error) => console.error(`Failed to generate session sprite for ${playerName}:`, err));

      // Preload all 9 expression variants for protagonist portrait in background
      characterPortraitService.preloadAllExpressions(playerName, characterDescription)
        .then(({ started, existing }) => {
          console.log(`[Portraits] Preloaded expressions for ${playerName}: ${started} started, ${existing} existing`);
        })
        .catch((err: Error) => console.error(`Failed to preload portraits for ${playerName}:`, err));

      res.status(201).json({
        conversationId: conversation.id,
        sessionToken: conversation.sessionToken,
        message: introText,
        storyArc: {
          title: storyArc.title,
          premise: storyArc.premise,
          currentChapter: currentChapter.title,
          totalChapters: storyArc.chapters.length
        }
      });

    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message });
      } else {
        console.error(err);
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  // Get Game State
  app.get(api.game.getState.path, async (req, res) => {
    // Validate conversationId is a positive integer
    const conversationIdRaw = req.params.conversationId;
    const conversationId = Number(conversationIdRaw);
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ message: "Invalid conversation ID" });
    }

    // Session token validation for authorization
    const sessionToken = req.headers['x-session-token'] as string;
    if (!sessionToken) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const isValid = await chatStorage.validateSessionToken(conversationId, sessionToken);
    if (!isValid) {
      return res.status(403).json({ message: "Access denied" });
    }

    const state = await storage.getGameState(conversationId);

    if (!state) {
      return res.status(404).json({ message: "Game state not found" });
    }

    // Fetch sprite URLs for NPCs in current scene positions
    const npcPositions = (state.npcPositions as Record<string, string>) ?? {};
    const npcSpriteUrls: Record<string, string> = {};
    for (const npcName of Object.keys(npcPositions)) {
      const sprite = await storage.getCharacterSprite(npcName);
      if (sprite?.spriteSheetUrl) {
        npcSpriteUrls[npcName] = sprite.spriteSheetUrl;
      }
    }

    // Use session-scoped player sprite URL directly from game_state
    res.json({
      playerName: state.playerName,
      house: state.house,
      health: state.health ?? 100,
      inventory: (state.inventory as string[]) ?? [],
      spells: (state.spells as string[]) ?? [],
      location: state.location ?? "Unknown",
      gameTime: state.gameTime ?? "Unknown",
      characterDescription: state.characterDescription ?? null,
      storyArc: state.storyArc ?? null,
      npcDescriptions: state.npcDescriptions ?? null,
      npcPositions: npcPositions,
      characterMoods: (state.characterMoods as Record<string, string>) ?? {},
      npcSpriteUrls: npcSpriteUrls,
      playerSpriteUrl: state.playerSpriteUrl ?? null,
      playerSpriteGenerated: state.playerSpriteGenerated ?? false,
      decisionCount: state.decisionCount ?? 0,
    });
  });

  return httpServer;
}
