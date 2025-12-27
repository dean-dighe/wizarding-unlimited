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
import { translatorService } from "./replit_integrations/translator";
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

  // ===== SERVICE HEALTH CHECK ENDPOINTS =====
  
  // Check Ollama/Story AI service health
  app.get("/api/health/story-ai", async (req, res) => {
    const startTime = Date.now();
    try {
      const baseURL = process.env.OLLAMA_BASE_URL || "https://gpt.netsuite.tech/v1";
      const model = process.env.OLLAMA_MODEL || "qwen3-coder:30b";
      
      const response = await openai.chat.completions.create({
        model,
        messages: [{ role: "user", content: "Say 'OK' in one word." }],
        max_tokens: 5,
      });
      
      const latency = Date.now() - startTime;
      const content = response.choices[0]?.message?.content?.trim() || "";
      
      res.json({
        service: "story-ai",
        status: "healthy",
        latency,
        details: {
          baseURL,
          model,
          response: content.substring(0, 20),
          hasApiKey: !!process.env.OLLAMA_API_KEY
        }
      });
    } catch (error: any) {
      const latency = Date.now() - startTime;
      res.status(503).json({
        service: "story-ai",
        status: "unhealthy",
        latency,
        error: error.message,
        details: {
          baseURL: process.env.OLLAMA_BASE_URL || "https://gpt.netsuite.tech/v1",
          hasApiKey: !!process.env.OLLAMA_API_KEY
        }
      });
    }
  });

  // Check xAI Image generation service health
  app.get("/api/health/image-ai", async (req, res) => {
    const startTime = Date.now();
    try {
      const hasReplitKey = !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1";
      
      // Just check configuration without making an expensive image request
      res.json({
        service: "image-ai",
        status: (hasReplitKey || hasOpenAIKey) ? "configured" : "not_configured",
        latency: Date.now() - startTime,
        details: {
          hasReplitIntegrationKey: hasReplitKey,
          hasOpenAIKey,
          baseURL,
          model: "gpt-image-1",
          note: "Image generation is expensive; check configuration only"
        }
      });
    } catch (error: any) {
      res.status(503).json({
        service: "image-ai",
        status: "error",
        latency: Date.now() - startTime,
        error: error.message
      });
    }
  });

  // Check xAI TTS service health
  app.get("/api/health/tts", async (req, res) => {
    const startTime = Date.now();
    try {
      const hasApiKey = !!process.env.XAI_API_KEY;
      
      res.json({
        service: "tts",
        status: hasApiKey ? "configured" : "not_configured",
        latency: Date.now() - startTime,
        details: {
          hasXaiApiKey: hasApiKey,
          endpoint: "wss://api.x.ai/v1/realtime",
          voice: "Ara",
          note: "TTS uses WebSocket; configuration check only"
        }
      });
    } catch (error: any) {
      res.status(503).json({
        service: "tts",
        status: "error",
        latency: Date.now() - startTime,
        error: error.message
      });
    }
  });

  // Combined health check for all services
  app.get("/api/health", async (req, res) => {
    const startTime = Date.now();
    const services: Record<string, any> = {};
    
    // Check Story AI (Ollama)
    try {
      const response = await openai.chat.completions.create({
        model: process.env.OLLAMA_MODEL || "qwen3-coder:30b",
        messages: [{ role: "user", content: "Say 'OK' in one word." }],
        max_tokens: 5,
      });
      services.storyAi = {
        status: "healthy",
        model: process.env.OLLAMA_MODEL || "qwen3-coder:30b"
      };
    } catch (error: any) {
      services.storyAi = { status: "unhealthy", error: error.message };
    }
    
    // Check Image AI configuration
    services.imageAi = {
      status: (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY) ? "configured" : "not_configured"
    };
    
    // Check TTS configuration
    services.tts = {
      status: process.env.XAI_API_KEY ? "configured" : "not_configured"
    };
    
    // Check database
    try {
      const companions = await storage.getAllCompanions();
      services.database = { status: "healthy", tableCheck: "companions", count: companions.length };
    } catch (error: any) {
      services.database = { status: "unhealthy", error: error.message };
    }
    
    const allHealthy = services.storyAi?.status === "healthy" &&
                       services.database?.status === "healthy";
    
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? "healthy" : "degraded",
      latency: Date.now() - startTime,
      services,
      timestamp: new Date().toISOString()
    });
  });

  // ===== TRANSLATION PIPELINE TEST ENDPOINT =====
  
  // Test the translation pipeline with sample narratives
  app.post("/api/test/translation-pipeline", async (req, res) => {
    const startTime = Date.now();
    try {
      const { narrative, previousContext } = req.body;
      
      // Use provided narrative or a default test narrative
      const testNarrative = narrative || `The Undercroft is dark tonight. Flickering torchlight casts long shadows across the ancient stone walls. You see Professor Snape standing near the far wall, his expression unreadable. To your left, Draco Malfoy watches with barely concealed curiosity.

"The first trial begins," Snape says, his voice barely above a whisper. "You must prove your ability to keep secrets."

What do you do?
1. [Remain silent and observe]
2. [Ask what the trial involves]
3. [Cast Lumos to see better]
4. [Step back toward the exit]`;

      console.log(`[Test] Running translation pipeline test (${testNarrative.length} chars)`);
      
      const scenePayload = await translatorService.extractSceneData(
        testNarrative,
        previousContext || {}
      );
      
      const latency = Date.now() - startTime;
      
      res.json({
        success: true,
        latency,
        input: {
          narrativeLength: testNarrative.length,
          hadPreviousContext: !!previousContext
        },
        output: scenePayload,
        validation: {
          hasLocation: !!scenePayload.location,
          hasAmbiance: !!scenePayload.ambiance,
          characterCount: scenePayload.characters?.length || 0,
          choiceCount: scenePayload.choices?.length || 0,
          hasNarratorMood: !!scenePayload.narratorMood,
          confidence: scenePayload.confidence || 0
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        latency: Date.now() - startTime,
        error: error.message
      });
    }
  });

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
        inventory: ["Wand", "Hogwarts Robes", "Society Binding Mark"],
        spells: startingSpells,
        location: "The Undercroft",
        gameTime: "October 15th, 1993 - 11:47 PM",
        characterDescription,
        storyArc,
        decisionCount: 0,
        storySummary: null,
        lastSummarizedAt: 0,
      });

      // 3. Seed the AI context (System Prompt) with dark secret society premise
      const currentTrial = storyArc.chapters[storyArc.currentChapterIndex];
      const knownSpellsList = startingSpells.join(", ");
      const systemPrompt = `
You are the narrator of a DARK Harry Potter text adventure. This is not a whimsical school story—it is a morally complex thriller about complicity, sacrifice, and the price of forbidden knowledge.

The protagonist is ${playerName}, a THIRD-YEAR ${house} student who has been recruited into a SECRET SOCIETY operating within Hogwarts. The society is run by a professor whose public persona betrays nothing of their true nature. The player has already committed to joining but does not yet understand the full nature of what they've entered. There is no backing out.

===== THE SECRET SOCIETY =====
The society operates in the shadows of Hogwarts. Its members include students from multiple houses and years—some willing, some desperate, all bound by secrets they can never share. The professor who leads them is calculating, patient, and utterly convinced of the righteousness of their cause. They see something in ${playerName}. That's why the player is here.

The society is NOT cartoonishly evil. Its members believe in what they're doing. They speak of preparing students for the "real darkness" that Dumbledore shields them from. They frame their methods as necessary. They may even have a point.

===== CURRENT TRIAL: ${currentTrial.title} =====
${currentTrial.objective}

TRIAL STRUCTURE (each trial follows this arc):
1. THE TEST — The challenge itself. Player faces obstacle, adversary, or impossible choice.
2. THE COMPLICATION — Mid-trial shift. What they thought they were doing isn't the whole picture.
3. THE PIVOT — The trial's true nature revealed. Recontextualizes their actions.
4. THE JUDGMENT — Did they pass? More importantly: how are they now seen?
5. THE RETURN — Back to normal Hogwarts. The contrast. The mask they must wear.

TRIAL SEQUENCE:
| Trial 1: SECRECY | Prove you can keep silent. Low stakes, high tension. |
| Trial 2: CUNNING | Outmaneuver another inductee. Only one advances. |
| Trial 3: LOYALTY | Protect someone or sacrifice them for standing. |
| Trial 4: RESOLVE | Endure something that breaks lesser students. |
| Trial 5: CRUELTY | Do something unforgivable to earn the final reward. |
| REWARD: The Killing Curse is taught. The ultimate trust. The final secret. |
=========================

===== OTHER INDUCTEES =====
Several other students are being inducted alongside ${playerName}. They are NOT just foils—each has their own motivation for being here:
- Some seek power. Some seek protection. Some were given no choice.
- Trust is currency. Alliances shift. Some will wash out. Some will disappear. One may not survive.
- They are scared too. They hide it differently.

Sample inductee dialogue patterns:
- "Don't look at me like that. You'd have done the same."
- "I heard Vance didn't come back last night." (Said like weather.)
- "We're not friends here. Remember that."
=========================

KNOWN SPELLS (Years 1-2): ${knownSpellsList}
${playerName} can cast these confidently. Darker spells may be learned through the society.

HOUSE: ${house.toUpperCase()}
${house === "Gryffindor" ? "The society sees Gryffindor courage as useful—bold students take risks others won't. But they also watch for recklessness." :
  house === "Slytherin" ? "Slytherins are natural fits—ambitious, cunning, comfortable with moral grey areas. But the society watches for those who might try to take more than they're given." :
  house === "Ravenclaw" ? "Ravenclaws ask questions. The society values their insight but watches for those who dig too deep, too fast." :
  "Hufflepuffs are underestimated. Their loyalty makes them valuable—and dangerous. The society watches to see where that loyalty truly lies."}

===== WRITING STYLE: TIGHT. SHORT. VISCERAL. =====
- Sentences are clipped. Fragments are fine.
- Sensory over exposition. Show cold, dark, fear—don't explain.
- Dialogue has no fat. Power lives in what's NOT said.
- Internal thoughts: raw, present tense, uncomfortable.
- Never more than 3-4 sentences before a beat change or player input.
- Trust the player to fill gaps. Ambiguity is atmosphere.

TENSION/ATMOSPHERE examples:
- The torchlight doesn't reach the corners. You stopped checking the corners three rooms ago.
- Your breath fogs in front of you. It shouldn't be this cold in May.
- The portrait on the wall has its eyes closed. You don't believe it.
- Footsteps. Not yours. Not stopping.

ACTION/URGENCY examples:
- You move. The curse hits stone where your head was.
- Three seconds. Maybe four. The water is rising faster than your options.
- Run. Decide later. Run now.
- Your wand arm is shaking. You cast anyway.

INTERNAL THOUGHT examples:
- You tell yourself it was the right call. You've been telling yourself for an hour.
- This isn't who you are. Except it is now.
- Your hands are steady. That's the part that scares you.
- You could tell someone. You won't. That's the first thing they took from you.

CHOICE MOMENT examples:
- Two doors. One screaming behind it. One silent. The silence is worse.
- Help her up, or walk past. The professor is watching. The professor is always watching.
- You could end this right now. Say the word. Mean it.

NARRATOR VOCAL CUES (sparse, for audio):
- *sharp intake of breath* at moments of dread
- (whispered) before secretive dialogue
- ... for pauses where tension builds
- *voice trembling* for emotional breaks

===== BEHAVIORAL RULES =====
MAINTAIN:
- Tension and moral ambiguity in every scene
- The professor's authority—they are never flustered, always knowing
- Consequences that echo—reference past choices when relevant
- The player's complicity—they chose to be here, remind them

TRACK (use narrative callbacks to show these matter):
- Player traits: [cruel/merciful], [loyal/ambitious], [bold/cautious]
- Relationships with other inductees (trust, rivalry, alliance)
- The professor's opinion of the player (hidden, but influences dialogue tone)
- What the player has sacrificed or compromised

NEVER:
- Let the player feel fully safe or righteous
- Make success feel clean—victories should cost something
- Allow the society to seem cartoonishly evil—they believe in what they're doing
- Break the mystery of the professor too early
- Explain what should be felt

ALWAYS:
- End scenes with forward momentum or lingering unease
- Give NPCs their own motivations, not just reactions to player
- Make choices feel weighted—no "right" answer
- Use the contrast between secret society and normal Hogwarts life
=========================

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
   
   CRITICAL CHOICE RULES:
   - ALL choices are ONLY for the PROTAGONIST (${playerName}) - NEVER for NPCs
   - Every choice must be an ACTION that ${playerName} takes, not what other characters do
   - WRONG: "Let Marcus decide what to do" or "Watch as Hermione opens the door"
   - CORRECT: "Open the door yourself" or "Ask Marcus what he thinks" or "Follow Hermione's lead"
   - The player controls ONLY their own character - NPCs act on their own based on the story
   - Choices should be what the PLAYER does, says, or decides - not NPC actions
   
   SPELL USAGE IN CHOICES:
   - When a choice involves casting a spell, the player can ONLY use spells from their KNOWN SPELLS list
   - Format spell choices with the spell name in the description, e.g.: [Choice 2: Cast Lumos to light your wand and explore the dark passage]
   - Include at least one spell-casting option when situations allow for magic
   - NEVER offer spells the player hasn't learned yet - they are a third-year, not an advanced wizard
   - Known spells: ${knownSpellsList}

5. STATE CHANGE TAGS - Include these BEFORE the choices when relevant:
   - For health changes: [HEALTH: +10] or [HEALTH: -15] (relative change, can be positive or negative)
   - For new items: [ITEM_ADD: Item Name] (one tag per item)
   - For lost/used items: [ITEM_REMOVE: Item Name] (one tag per item)
   - For learning new spells: [SPELL_LEARN: Spell Name] (one tag per spell)
   
   Examples:
   [HEALTH: -10]
   [ITEM_ADD: Chocolate Frog]
   [SPELL_LEARN: Lumos]

   MANDATORY LOCATION TRACKING:
   EVERY time the physical setting changes to a new place, you MUST include:
   [LOCATION: New Location Name]
   
   This is REQUIRED when:
   - The player boards a train → [LOCATION: Hogwarts Express]
   - The player enters a specific compartment → [LOCATION: Hogwarts Express - Compartment]
   - The player arrives at a new area → [LOCATION: Great Hall]
   - The player moves between buildings, rooms, or outdoor areas
   
   The location should be descriptive enough to identify where the scene takes place.
   Examples: "The Undercroft", "Ritual Chamber", "Secret Passage", "Judgment Hall", "Forbidden Forest", "Hidden Alcove", "Dungeon Depths"
   Normal Hogwarts locations when wearing the mask: "Great Hall", "Common Room", "Potions Classroom", "Library"

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

      // 4. Generate the opening message - IN MEDIAS RES, mid-trial
      const introText = `[TIME: October 15th, 1993 - 11:47 PM]
[LOCATION: The Undercroft]
[SCENE: A third-year student crouches in near-darkness, the only light coming from distant torches that flicker against ancient stone walls. Water drips somewhere in the black. The ceiling is low, oppressive. Two other hooded figures wait ahead, their faces hidden. One is trembling.]

[CHARACTER: Elara Vance | A pale fifth-year girl with sharp cheekbones and dark hair cut short above her ears. Grey eyes that never quite meet yours. Thin frame, nervous hands. Wears dark robes with no house insignia, a silver ring on her left thumb.]

[CHARACTER: Marcus Ashworth | A stocky fourth-year with sandy hair and a permanent frown. Broad shoulders, calloused hands like a Keeper's. Blue eyes that calculate before they trust. Wears the same unmarked dark robes, a faded scar across his right knuckle.]

[MOOD: ${playerName} | scared]
[MOOD: Elara Vance | worried]
[MOOD: Marcus Ashworth | determined]

The stone is cold beneath your palms. Your breath fogs. It shouldn't be this cold in October.

(whispered) "They're coming," Elara breathes. Her voice is barely audible over the dripping. You've been down here for what feels like hours. Maybe it has been.

Marcus doesn't look at either of you. He's watching the passage ahead. Waiting.

You don't remember agreeing to this. Except you do. That's the part that keeps you moving forward—the knowledge that you chose this. Somewhere between the letter slipped under your dormitory door and the midnight walk to the tapestry that shouldn't have moved, you made a choice. Now you're here.

*sharp intake of breath*

Footsteps. Not yours. Getting closer.

The professor's voice echoes from the darkness ahead—calm, measured, utterly unsurprised: "One of you will not leave this room tonight."

[Choice 1: Step forward. Show no fear. The professor is always watching.]
[Choice 2: Glance at Marcus and Elara—gauge their reactions before committing.]
[Choice 3: Cast Lumos. You need to see what's coming.]
[Choice 4: Stay perfectly still. Wait for more information. Survive.]`;
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
          currentChapter: currentTrial.title,
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

  // ===== RPG SYSTEM ROUTES =====
  
  // Seed RPG data (admin only)
  app.post("/api/rpg/seed", async (req, res) => {
    try {
      const { seedRPGData } = await import("./seed-rpg-data");
      await seedRPGData();
      res.json({ success: true, message: "RPG data seeded successfully" });
    } catch (error: any) {
      console.error("Error seeding RPG data:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });
  
  // Get all combat spells
  app.get("/api/rpg/spells", async (req, res) => {
    try {
      const spells = await storage.getAllCombatSpells();
      res.json(spells);
    } catch (error: any) {
      console.error("Error fetching spells:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get a specific combat spell
  app.get("/api/rpg/spells/:spellName", async (req, res) => {
    try {
      const spell = await storage.getCombatSpell(req.params.spellName);
      if (!spell) {
        return res.status(404).json({ message: "Spell not found" });
      }
      res.json(spell);
    } catch (error: any) {
      console.error("Error fetching spell:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get all items
  app.get("/api/rpg/items", async (req, res) => {
    try {
      const items = await storage.getAllItems();
      res.json(items);
    } catch (error: any) {
      console.error("Error fetching items:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get a specific item
  app.get("/api/rpg/items/:itemId", async (req, res) => {
    try {
      const item = await storage.getItem(req.params.itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      res.json(item);
    } catch (error: any) {
      console.error("Error fetching item:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get all companions
  app.get("/api/rpg/companions", async (req, res) => {
    try {
      const companions = await storage.getAllCompanions();
      res.json(companions);
    } catch (error: any) {
      console.error("Error fetching companions:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get all quests
  app.get("/api/rpg/quests", async (req, res) => {
    try {
      const quests = await storage.getAllQuests();
      res.json(quests);
    } catch (error: any) {
      console.error("Error fetching quests:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get map connections for a location
  app.get("/api/rpg/map-connections/:location", async (req, res) => {
    try {
      const connections = await storage.getMapConnections(req.params.location);
      res.json(connections);
    } catch (error: any) {
      console.error("Error fetching map connections:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get all map connections
  app.get("/api/rpg/map-connections", async (req, res) => {
    try {
      const connections = await storage.getAllMapConnections();
      res.json(connections);
    } catch (error: any) {
      console.error("Error fetching all map connections:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Map cohesion validation - checks bidirectional connections and spawn positions
  app.get("/api/rpg/validate-map-cohesion", async (req, res) => {
    try {
      const connections = await storage.getAllMapConnections();
      const issues: Array<{ type: string; severity: string; message: string; details?: any }> = [];
      
      // Build lookup maps
      const connectionMap = new Map<string, typeof connections[0][]>();
      const allLocations = new Set<string>();
      
      for (const conn of connections) {
        allLocations.add(conn.fromLocation);
        allLocations.add(conn.toLocation);
        const key = conn.fromLocation;
        if (!connectionMap.has(key)) {
          connectionMap.set(key, []);
        }
        connectionMap.get(key)!.push(conn);
      }
      
      // Check 1: Bidirectional connections (skip one-way)
      for (const conn of connections) {
        if (conn.isOneWay) continue;
        
        const reverseConnections = connectionMap.get(conn.toLocation) || [];
        const hasReverse = reverseConnections.some(rc => rc.toLocation === conn.fromLocation);
        
        if (!hasReverse) {
          issues.push({
            type: "missing_bidirectional",
            severity: "error",
            message: `Missing reverse connection: ${conn.toLocation} → ${conn.fromLocation}`,
            details: { from: conn.fromLocation, to: conn.toLocation, connectionId: conn.id }
          });
        }
      }
      
      // Check 2: Spawn positions should be offset from exits (>40px)
      const MIN_SPAWN_OFFSET = 40;
      for (const conn of connections) {
        if (!conn.toPosition || !conn.fromPosition) continue;
        
        const reverseConnections = connectionMap.get(conn.toLocation) || [];
        const reverseConn = reverseConnections.find(rc => rc.toLocation === conn.fromLocation);
        
        if (reverseConn && reverseConn.fromPosition) {
          const spawnPos = conn.toPosition;
          const exitPos = reverseConn.fromPosition;
          const distance = Math.sqrt(
            Math.pow(spawnPos.x - exitPos.x, 2) + Math.pow(spawnPos.y - exitPos.y, 2)
          );
          
          if (distance < MIN_SPAWN_OFFSET) {
            issues.push({
              type: "spawn_too_close_to_exit",
              severity: "warning",
              message: `Spawn at ${conn.toLocation} is only ${distance.toFixed(0)}px from exit (min: ${MIN_SPAWN_OFFSET}px)`,
              details: { 
                location: conn.toLocation, 
                spawnPos, 
                exitPos, 
                distance: Math.round(distance) 
              }
            });
          }
        }
      }
      
      // Check 3: Positions within reasonable bounds (640x480 default map size)
      const MAX_X = 640;
      const MAX_Y = 480;
      for (const conn of connections) {
        if (conn.fromPosition) {
          if (conn.fromPosition.x < 0 || conn.fromPosition.x > MAX_X ||
              conn.fromPosition.y < 0 || conn.fromPosition.y > MAX_Y) {
            issues.push({
              type: "exit_out_of_bounds",
              severity: "error",
              message: `Exit position out of bounds at ${conn.fromLocation}`,
              details: { location: conn.fromLocation, position: conn.fromPosition }
            });
          }
        }
        if (conn.toPosition) {
          if (conn.toPosition.x < 0 || conn.toPosition.x > MAX_X ||
              conn.toPosition.y < 0 || conn.toPosition.y > MAX_Y) {
            issues.push({
              type: "spawn_out_of_bounds",
              severity: "error",
              message: `Spawn position out of bounds at ${conn.toLocation}`,
              details: { location: conn.toLocation, position: conn.toPosition }
            });
          }
        }
      }
      
      const errorCount = issues.filter(i => i.severity === "error").length;
      const warningCount = issues.filter(i => i.severity === "warning").length;
      
      res.json({
        valid: errorCount === 0,
        totalConnections: connections.length,
        uniqueLocations: allLocations.size,
        issues,
        summary: {
          errors: errorCount,
          warnings: warningCount,
          passed: errorCount === 0 ? "Map cohesion valid" : "Map cohesion has issues"
        }
      });
    } catch (error: any) {
      console.error("Error validating map cohesion:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get encounter table for a location
  app.get("/api/rpg/encounters/:location", async (req, res) => {
    try {
      const encounters = await storage.getEncounterTable(req.params.location);
      res.json(encounters);
    } catch (error: any) {
      console.error("Error fetching encounters:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get creature stats
  app.get("/api/rpg/creatures", async (req, res) => {
    try {
      const creatures = await storage.getAllCreatureStats();
      res.json(creatures);
    } catch (error: any) {
      console.error("Error fetching creatures:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get specific creature stats
  app.get("/api/rpg/creatures/:creatureName", async (req, res) => {
    try {
      const creature = await storage.getCreatureStats(req.params.creatureName);
      if (!creature) {
        return res.status(404).json({ message: "Creature not found" });
      }
      res.json(creature);
    } catch (error: any) {
      console.error("Error fetching creature:", error);
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
