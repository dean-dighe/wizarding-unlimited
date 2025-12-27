import OpenAI from "openai";
import { storage } from "../../storage";
import { GameAssetStorageService } from "./storage";
import { DEFAULT_ANIMATION_CONFIG, CharacterSprite } from "@shared/schema";

const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY || "",
  baseURL: "https://api.x.ai/v1",
});

const SPRITE_STYLE_PROMPT = `Pokemon FireRed/LeafGreen style character sprite sheet.
EXACT FORMAT: 4 rows x 3 columns grid = 12 frames total, each frame 32x32 pixels.
Total image size: 96 pixels wide x 128 pixels tall.

LAYOUT (from top to bottom):
Row 1: Character facing DOWN - idle, left foot, right foot (walking cycle)
Row 2: Character facing UP - idle, left foot, right foot (walking cycle)  
Row 3: Character facing LEFT - idle, left foot, right foot (walking cycle)
Row 4: Character facing RIGHT - idle, left foot, right foot (walking cycle)

STYLE REQUIREMENTS:
- Game Boy Advance pixel art aesthetic
- Bold black 1-2 pixel outlines around character
- 16-color palette maximum
- NO anti-aliasing, NO gradients
- Top-down RPG perspective (3/4 view)
- Character fills most of each 32x32 frame
- Clean grid separation between frames
- Solid single-color background (green or magenta for transparency)`;

const SIGNIFICANT_APPEARANCE_KEYWORDS = [
  "scar", "injured", "wounded", "bandage", "blood",
  "transformed", "werewolf", "animagus", "polyjuice",
  "new robes", "disguise", "cloak", "armor", "uniform",
  "aged", "younger", "older", "changed",
  "hair color", "dyed", "shaved", "bald",
  "glasses broken", "eye patch", "missing",
  "burned", "frozen", "glowing", "possessed"
];

export class SpriteGenerationService {
  private assetStorage: GameAssetStorageService;

  constructor() {
    this.assetStorage = new GameAssetStorageService();
  }

  generateAppearanceSignature(description: string): string {
    const normalized = description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .sort()
      .join(' ')
      .trim();
    
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `sig_${Math.abs(hash).toString(16)}`;
  }

  detectSignificantChange(oldDescription: string, newDescription: string): { hasChange: boolean; changeSummary: string } {
    const newLower = newDescription.toLowerCase();
    const oldLower = oldDescription.toLowerCase();
    
    const changes: string[] = [];
    for (const keyword of SIGNIFICANT_APPEARANCE_KEYWORDS) {
      if (newLower.includes(keyword) && !oldLower.includes(keyword)) {
        changes.push(keyword);
      }
    }
    
    if (changes.length > 0) {
      return { hasChange: true, changeSummary: changes.join(', ') };
    }
    
    return { hasChange: false, changeSummary: '' };
  }

  async getOrCreateSprite(
    characterName: string,
    characterDescription: string,
    options: { isProtagonist?: boolean; isCanon?: boolean } = {}
  ): Promise<string> {
    const existingSprite = await storage.getCharacterSprite(characterName);
    if (existingSprite) {
      const { hasChange, changeSummary } = this.detectSignificantChange(
        existingSprite.characterDescription || '',
        characterDescription
      );
      
      if (hasChange) {
        console.log(`[Sprite] Significant appearance change detected for ${characterName}: ${changeSummary}`);
        return this.updateSprite(existingSprite, characterDescription, changeSummary);
      }
      
      return existingSprite.spriteSheetUrl;
    }

    return this.generateAndStoreSprite(characterName, characterDescription, options);
  }

  async updateSprite(
    existingSprite: CharacterSprite,
    newDescription: string,
    changeSummary: string
  ): Promise<string> {
    console.log(`[Sprite] Updating sprite for ${existingSprite.characterName} - ${changeSummary}`);
    
    const updatePrompt = this.buildUpdateSpritePrompt(
      existingSprite.characterName,
      existingSprite.characterDescription || '',
      newDescription,
      changeSummary
    );
    
    try {
      const response = await xai.images.generate({
        model: "grok-2-image-1212",
        prompt: updatePrompt.slice(0, 1000),
        n: 1,
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        throw new Error("No image URL returned from xAI");
      }

      const imageBuffer = await this.downloadImage(imageUrl);
      const storedUrl = await this.assetStorage.uploadSprite(
        imageBuffer, 
        `${existingSprite.characterName}_v${(existingSprite.variantVersion || 1) + 1}`
      );
      
      await storage.updateCharacterSprite(existingSprite.characterName, {
        spriteSheetUrl: storedUrl,
        characterDescription: newDescription,
        appearanceSignature: this.generateAppearanceSignature(newDescription),
        variantVersion: (existingSprite.variantVersion || 1) + 1,
        previousSpriteUrl: existingSprite.spriteSheetUrl,
        lastAppearanceChange: changeSummary,
      });
      
      console.log(`[Sprite] Updated sprite for ${existingSprite.characterName} to v${(existingSprite.variantVersion || 1) + 1}`);
      return storedUrl;
    } catch (error) {
      console.error(`[Sprite] Failed to update sprite for ${existingSprite.characterName}:`, error);
      return existingSprite.spriteSheetUrl;
    }
  }

  async generateAndStoreSprite(
    characterName: string,
    characterDescription: string,
    options: { isProtagonist?: boolean; isCanon?: boolean } = {}
  ): Promise<string> {
    const spriteImageUrl = await this.generateSpriteSheet(characterName, characterDescription);
    
    const imageBuffer = await this.downloadImage(spriteImageUrl);
    const storedUrl = await this.assetStorage.uploadSprite(imageBuffer, characterName);
    
    await storage.createCharacterSprite({
      characterName,
      isProtagonist: options.isProtagonist ?? false,
      isCanon: options.isCanon ?? false,
      spriteSheetUrl: storedUrl,
      characterDescription,
      appearanceSignature: this.generateAppearanceSignature(characterDescription),
      variantVersion: 1,
      spriteWidth: 32,
      spriteHeight: 32,
      frameCount: 12,
      animationConfig: DEFAULT_ANIMATION_CONFIG,
    });
    
    return storedUrl;
  }

  private async generateSpriteSheet(characterName: string, description: string): Promise<string> {
    const prompt = this.buildSpritePrompt(characterName, description);
    
    try {
      const response = await xai.images.generate({
        model: "grok-2-image-1212",
        prompt: prompt.slice(0, 1000),
        n: 1,
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        throw new Error("No image URL returned from xAI");
      }

      return imageUrl;
    } catch (error) {
      console.error("Error generating sprite:", error);
      throw new Error(`Failed to generate sprite for ${characterName}`);
    }
  }

  private buildSpritePrompt(characterName: string, description: string): string {
    const cleanDescription = description.slice(0, 200);
    
    return `${SPRITE_STYLE_PROMPT}

CHARACTER TO DRAW: ${characterName}
APPEARANCE: ${cleanDescription}

Draw this Harry Potter character as a cute chibi-style RPG sprite.
The character should be recognizable with their key visual features.
Hogwarts robes, wand visible, magical fantasy style.`;
  }

  private buildUpdateSpritePrompt(characterName: string, oldDescription: string, newDescription: string, change: string): string {
    const cleanOld = oldDescription.slice(0, 100);
    const cleanNew = newDescription.slice(0, 150);
    
    return `${SPRITE_STYLE_PROMPT}

CHARACTER TO DRAW: ${characterName}
ORIGINAL APPEARANCE: ${cleanOld}
NEW APPEARANCE (with changes): ${cleanNew}
KEY CHANGE: ${change}

Update this Harry Potter character sprite to show their changed appearance.
Keep the same character recognizable but with the noted changes visible.
Hogwarts robes, wand visible, magical fantasy style.`;
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async generateCanonCharacterSprites(): Promise<void> {
    for (const character of CANON_CHARACTERS) {
      const existing = await storage.getCharacterSprite(character.name);
      if (!existing) {
        try {
          console.log(`[Sprite-gen] Starting: ${character.name}`);
          await this.generateAndStoreSprite(character.name, character.description, { isCanon: true });
          console.log(`[Sprite-gen] Completed: ${character.name}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`[Sprite-gen] Failed: ${character.name}:`, error);
        }
      }
    }
  }

  static getAllCanonCharacterNames(): string[] {
    return CANON_CHARACTERS.map(c => c.name);
  }
}

export const CANON_CHARACTERS: { name: string; description: string; category: string }[] = [
  // Main Trio
  { name: "Harry Potter", description: "A thin boy with unruly black hair, round glasses, green eyes, and a lightning bolt scar on his forehead. Wears Gryffindor robes.", category: "student" },
  { name: "Hermione Granger", description: "A girl with bushy brown hair, brown eyes, and slightly large front teeth. Wears Gryffindor robes, often carrying books.", category: "student" },
  { name: "Ron Weasley", description: "A tall, thin boy with bright red hair, freckles, blue eyes, and a long nose. Wears Gryffindor robes.", category: "student" },
  
  // Gryffindor Students
  { name: "Neville Longbottom", description: "A round-faced boy with dark hair, often looking nervous. Wears Gryffindor robes, sometimes holds a toad.", category: "student" },
  { name: "Ginny Weasley", description: "A girl with bright red hair like her brothers, brown eyes, freckles. Wears Gryffindor robes.", category: "student" },
  { name: "Fred Weasley", description: "A tall boy with red hair, freckles, mischievous grin. Identical twin. Wears Gryffindor robes.", category: "student" },
  { name: "George Weasley", description: "A tall boy with red hair, freckles, mischievous grin. Identical twin. Wears Gryffindor robes.", category: "student" },
  { name: "Seamus Finnigan", description: "A sandy-haired boy with Irish accent tendencies, often with singed eyebrows. Wears Gryffindor robes.", category: "student" },
  { name: "Dean Thomas", description: "A tall Black boy with dreadlocks, into football. Wears Gryffindor robes.", category: "student" },
  { name: "Lavender Brown", description: "A girl with curly blonde hair, giggly personality. Wears Gryffindor robes.", category: "student" },
  { name: "Parvati Patil", description: "An Indian girl with long dark hair, often with her twin sister. Wears Gryffindor robes.", category: "student" },
  { name: "Oliver Wood", description: "A burly boy, Quidditch captain, intense about the sport. Wears Gryffindor Quidditch robes.", category: "student" },
  { name: "Lee Jordan", description: "A boy with dreadlocks, Quidditch commentator, friends with the twins. Wears Gryffindor robes.", category: "student" },
  
  // Slytherin Students
  { name: "Draco Malfoy", description: "A pale boy with sleek platinum blonde hair, pointed face, grey eyes, and a sneering expression. Wears Slytherin robes.", category: "student" },
  { name: "Vincent Crabbe", description: "A large, thickset boy with a pudding-bowl haircut, dull expression. Wears Slytherin robes.", category: "student" },
  { name: "Gregory Goyle", description: "A large, gorilla-like boy with small dull eyes. Wears Slytherin robes.", category: "student" },
  { name: "Pansy Parkinson", description: "A pug-faced girl with dark hair, mean expression. Wears Slytherin robes.", category: "student" },
  { name: "Blaise Zabini", description: "A tall, handsome Black boy with high cheekbones, aloof demeanor. Wears Slytherin robes.", category: "student" },
  { name: "Marcus Flint", description: "A large, troll-like boy with bad teeth, Slytherin Quidditch captain. Wears Slytherin robes.", category: "student" },
  
  // Ravenclaw Students
  { name: "Cho Chang", description: "A pretty Asian girl with long dark hair, Seeker. Wears Ravenclaw robes.", category: "student" },
  { name: "Luna Lovegood", description: "A girl with straggly dirty-blonde hair, protuberant silvery eyes, dreamy expression. Wears Ravenclaw robes and radish earrings.", category: "student" },
  { name: "Padma Patil", description: "An Indian girl with long dark hair, twin sister of Parvati. Wears Ravenclaw robes.", category: "student" },
  
  // Hufflepuff Students
  { name: "Cedric Diggory", description: "A handsome boy with grey eyes and dark hair, athletic build, Quidditch Seeker. Wears Hufflepuff robes.", category: "student" },
  { name: "Ernie Macmillan", description: "A pompous boy with an important manner. Wears Hufflepuff robes.", category: "student" },
  { name: "Hannah Abbott", description: "A pink-faced girl with blonde pigtails. Wears Hufflepuff robes.", category: "student" },
  { name: "Justin Finch-Fletchley", description: "A curly-haired boy from a Muggle family. Wears Hufflepuff robes.", category: "student" },
  
  // Hogwarts Staff
  { name: "Professor Dumbledore", description: "An elderly wizard with long silver hair and beard, half-moon spectacles, crooked nose, wearing magnificent purple robes.", category: "staff" },
  { name: "Professor McGonagall", description: "A tall, stern-looking older woman with grey hair in a tight bun, square spectacles, emerald robes.", category: "staff" },
  { name: "Professor Snape", description: "A thin man with sallow skin, long greasy black hair, hooked nose, dark eyes, and billowing black robes.", category: "staff" },
  { name: "Hagrid", description: "A giant of a man with wild black bushy hair and beard, beetle-black eyes, wearing a massive moleskin overcoat.", category: "staff" },
  { name: "Professor Flitwick", description: "A tiny wizard with white hair, so small he stands on books. Wears blue robes.", category: "staff" },
  { name: "Professor Sprout", description: "A dumpy witch with flyaway grey hair, usually dirt on her robes. Wears patched clothes.", category: "staff" },
  { name: "Madam Hooch", description: "A witch with short grey hair and yellow hawk-like eyes. Wears Quidditch referee robes.", category: "staff" },
  { name: "Professor Trelawney", description: "A thin woman with huge glasses magnifying her eyes, draped in shawls and bangles.", category: "staff" },
  { name: "Professor Quirrell", description: "A young nervous man wearing a purple turban, stuttering speech. Wears plain robes.", category: "staff" },
  { name: "Professor Lockhart", description: "A handsome wizard with wavy blonde hair, bright blue eyes, dazzling smile. Wears flamboyant robes.", category: "staff" },
  { name: "Professor Lupin", description: "A tired-looking man with grey-streaked brown hair, shabby robes, kind face with premature aging.", category: "staff" },
  { name: "Mad-Eye Moody", description: "A grizzled man with a chunk of his nose missing, magical electric-blue eye, wooden leg, scarred face.", category: "staff" },
  { name: "Madam Pomfrey", description: "A strict matron with a white apron and cap, carrying healing potions. Hospital Wing nurse.", category: "staff" },
  { name: "Madam Pince", description: "A thin, irritable witch resembling an underfed vulture. Library guardian.", category: "staff" },
  { name: "Argus Filch", description: "A bitter, hunched man with a gray skin, rheumy eyes, jowly cheeks. Caretaker in tatty coat.", category: "staff" },
  { name: "Professor Binns", description: "A ghostly elderly wizard, very old and shriveled, droning voice. Translucent grey.", category: "staff" },
  
  // Ghosts
  { name: "Nearly Headless Nick", description: "A ghost with a nearly severed head, ruff collar, doublet. Translucent grey Gryffindor ghost.", category: "ghost" },
  { name: "The Bloody Baron", description: "A gaunt ghost covered in silver bloodstains, blank staring eyes. Slytherin ghost.", category: "ghost" },
  { name: "The Grey Lady", description: "A beautiful ghost with floor-length hair, elegant robes. Ravenclaw ghost.", category: "ghost" },
  { name: "The Fat Friar", description: "A jolly, fat ghost monk with a tonsure. Hufflepuff ghost.", category: "ghost" },
  { name: "Peeves", description: "A poltergeist with wickedly mischievous expression, wearing a bell-covered hat.", category: "ghost" },
  { name: "Moaning Myrtle", description: "A ghost of a teenage girl with mousy hair, glasses, acne, perpetual pout.", category: "ghost" },
  
  // Other Important Characters
  { name: "Dobby", description: "A small house-elf with large tennis-ball green eyes, bat-like ears, wearing a pillowcase.", category: "creature" },
  { name: "Sirius Black", description: "A man with long dark hair, gaunt handsome face, grey eyes. Wears worn wizard robes.", category: "adult" },
  { name: "Remus Lupin", description: "A tired-looking man with grey-streaked brown hair, shabby robes, kind face with premature aging.", category: "adult" },
  { name: "Peter Pettigrew", description: "A small, rat-like man with watery eyes, pointed nose, thinning hair.", category: "adult" },
  { name: "Arthur Weasley", description: "A thin, balding red-haired man with glasses, wearing patched robes.", category: "adult" },
  { name: "Molly Weasley", description: "A plump, kind-faced woman with red hair, wearing a flowered apron.", category: "adult" },
  { name: "Lucius Malfoy", description: "A pale man with long platinum blonde hair, cold grey eyes, carrying a snake-head cane.", category: "adult" },
  { name: "Cornelius Fudge", description: "A portly man in a pinstriped cloak, bowler hat, pompous manner.", category: "adult" },
  
  // Shopkeepers and Others
  { name: "Tom the Innkeeper", description: "An old, bald, toothless man, hunched, wearing a barkeep's apron. Leaky Cauldron owner.", category: "adult" },
  { name: "Mr. Ollivander", description: "An old man with wide pale eyes, silvery white hair, mysterious manner. Wand maker.", category: "adult" },
  { name: "Madam Rosmerta", description: "A curvy witch with a pretty face, running the Three Broomsticks pub.", category: "adult" },
  { name: "Trolley Witch", description: "An elderly witch with a kindly face, pushing a food trolley on the Hogwarts Express.", category: "adult" },
  
  // Additional Important Students
  { name: "Colin Creevey", description: "A small mousy-haired boy, always carrying a camera, wide-eyed and excited. Wears Gryffindor robes.", category: "student" },
  { name: "Katie Bell", description: "A Gryffindor Chaser with dark hair, athletic build. Wears Gryffindor Quidditch robes.", category: "student" },
  { name: "Angelina Johnson", description: "A tall Black girl with long braided hair, Gryffindor Chaser. Wears Gryffindor robes.", category: "student" },
  { name: "Alicia Spinnet", description: "A Gryffindor Chaser with determined expression. Wears Gryffindor Quidditch robes.", category: "student" },
  { name: "Percy Weasley", description: "A pompous red-haired boy with horn-rimmed glasses, prefect badge. Wears Gryffindor robes.", category: "student" },
  { name: "Bill Weasley", description: "A tall young man with long red hair, fang earring, dragon-hide boots. Cool older Weasley.", category: "adult" },
  { name: "Charlie Weasley", description: "A stocky redhead with freckles, muscular from dragon handling, friendly grin.", category: "adult" },
  { name: "Fleur Delacour", description: "A beautiful witch with silvery-blonde hair, blue eyes, elegant Beauxbatons uniform.", category: "student" },
  { name: "Viktor Krum", description: "A surly young man with dark hair, thick eyebrows, duck-footed walk. Durmstrang uniform.", category: "student" },
  { name: "Theodore Nott", description: "A thin, weedy-looking Slytherin boy with dark hair. Wears Slytherin robes.", category: "student" },
  { name: "Daphne Greengrass", description: "A pretty Slytherin girl with dark hair and sharp features. Wears Slytherin robes.", category: "student" },
  { name: "Millicent Bulstrode", description: "A large, square-built Slytherin girl with heavy jaw. Wears Slytherin robes.", category: "student" },
  { name: "Michael Corner", description: "A dark-haired Ravenclaw boy with sharp features. Wears Ravenclaw robes.", category: "student" },
  { name: "Terry Boot", description: "A Ravenclaw boy known for being smart and studious. Wears Ravenclaw robes.", category: "student" },
  { name: "Anthony Goldstein", description: "A Ravenclaw prefect with curly hair. Wears Ravenclaw robes.", category: "student" },
  { name: "Susan Bones", description: "A Hufflepuff girl with a plait down her back, niece of Amelia Bones. Wears Hufflepuff robes.", category: "student" },
  { name: "Zacharias Smith", description: "A pompous blonde Hufflepuff boy with an upturned nose. Wears Hufflepuff robes.", category: "student" },
  
  // Dark Wizards and Villains
  { name: "Lord Voldemort", description: "A skeletal figure with chalk-white skin, flat snake-like face, red slit eyes, no nose. Black robes.", category: "villain" },
  { name: "Bellatrix Lestrange", description: "A woman with heavy-lidded dark eyes, wild black hair, gaunt face, mad expression. Black robes.", category: "villain" },
  { name: "Barty Crouch Jr", description: "A pale young man with straw-colored hair, freckles, manic expression. Death Eater robes.", category: "villain" },
  { name: "Fenrir Greyback", description: "A massive savage werewolf in human form with matted grey hair, pointed teeth, blood under nails.", category: "villain" },
  { name: "Dolores Umbridge", description: "A squat woman with broad flabby face, pouchy toad-like eyes, pink cardigan and bow.", category: "villain" },
  { name: "Narcissa Malfoy", description: "A tall slim woman with blonde hair, cold beautiful face, haughty expression. Elegant robes.", category: "adult" },
  { name: "Walden Macnair", description: "A large wizard with black hair and mustache, executioner for Ministry. Dark robes.", category: "villain" },
  
  // Order of the Phoenix Members
  { name: "Nymphadora Tonks", description: "A young witch with a heart-shaped face, spiky pink hair (changes color), clumsy manner. Auror robes.", category: "adult" },
  { name: "Kingsley Shacklebolt", description: "A tall, bald Black wizard with a slow deep voice, gold hoop earring. Auror robes.", category: "adult" },
  { name: "Mundungus Fletcher", description: "A squat, ginger-haired man with baggy clothes, smells of tobacco and drink. Shady dealer.", category: "adult" },
  { name: "Alastor Moody", description: "A grizzled man with a chunk of his nose missing, magical electric-blue eye, wooden leg, scarred face.", category: "adult" },
  { name: "Elphias Doge", description: "An elderly wizard with a wheezy voice, wispy white hair. Dumbledore's old friend.", category: "adult" },
  { name: "Emmeline Vance", description: "A stately witch with an elegant manner. Order of the Phoenix member.", category: "adult" },
  
  // Ministry Officials
  { name: "Rufus Scrimgeour", description: "A lion-like wizard with tawny hair and bushy eyebrows, sharp yellow eyes, limp. Minister robes.", category: "adult" },
  { name: "Pius Thicknesse", description: "A thin wizard with a long face, under Imperius Curse. Minister robes.", category: "adult" },
  { name: "Amelia Bones", description: "A square-jawed witch with short grey hair, monocle. Head of Magical Law Enforcement.", category: "adult" },
  { name: "Barty Crouch Sr", description: "A stiff, rigid man with grey hair parted severely, toothbrush mustache. Formal robes.", category: "adult" },
  { name: "Ludo Bagman", description: "A portly wizard with round boyish face, blond hair, former Quidditch player. Yellow robes.", category: "adult" },
  
  // Hogwarts Founders (Historical/Portraits)
  { name: "Godric Gryffindor", description: "A medieval wizard with wild red-gold hair, full beard, scarlet and gold robes, holding a sword.", category: "historical" },
  { name: "Salazar Slytherin", description: "A cunning medieval wizard with a monkey-like face, silver and green robes, serpent motifs.", category: "historical" },
  { name: "Rowena Ravenclaw", description: "A beautiful medieval witch with dark hair and tiara diadem, blue and bronze robes.", category: "historical" },
  { name: "Helga Hufflepuff", description: "A plump medieval witch with kind face, holding a cup, yellow and black robes.", category: "historical" },
  
  // Magical Creatures - Humanoid
  { name: "Kreacher", description: "An ancient house-elf with folds of skin, bat-like ears, white hair in ears, wearing dirty rag.", category: "creature" },
  { name: "Winky", description: "A small female house-elf with large brown eyes, wearing a tea towel. Sad expression.", category: "creature" },
  { name: "Griphook", description: "A small goblin with dark slanting eyes, pointed beard, very long fingers and feet.", category: "creature" },
  { name: "Ragnok", description: "A goblin with a swarthy clever face, long thin fingers, head of Gringotts.", category: "creature" },
  { name: "Firenze", description: "A centaur with white-blonde hair, blue eyes, palomino body, human torso, gentle demeanor.", category: "creature" },
  { name: "Bane", description: "A fierce black centaur with dark eyes, proud bearing, hostile to humans.", category: "creature" },
  { name: "Ronan", description: "A chestnut-colored centaur with red hair and beard, melancholy expression.", category: "creature" },
  { name: "Magorian", description: "The leader of the centaur herd, imposing chestnut centaur with stern expression.", category: "creature" },
  { name: "Fleur's Grandmother (Veela)", description: "A beautiful humanoid with silvery-white hair, unearthly beauty, can transform to harpy-like form.", category: "creature" },
  
  // Magical Creatures - Monsters
  { name: "Mountain Troll", description: "A huge grey-skinned creature with small bald head, great lumpy body, flat horny feet, holding a club.", category: "monster" },
  { name: "Forest Troll", description: "A pale green troll with dark patches, slightly smaller than mountain troll, lives in forests.", category: "monster" },
  { name: "Fluffy", description: "An enormous three-headed dog with drooling mouths, each head with yellow eyes, massive brown fur.", category: "monster" },
  { name: "Norbert the Dragon", description: "A baby Norwegian Ridgeback dragon with spiny wings, long snout, black scales, orange eyes.", category: "monster" },
  { name: "Hungarian Horntail", description: "A massive black dragon with bronze horns, yellow eyes, spiked tail, most dangerous dragon breed.", category: "monster" },
  { name: "Swedish Short-Snout", description: "A silvery-blue dragon with blue flames, pointed snout, sleek build.", category: "monster" },
  { name: "Chinese Fireball", description: "A scarlet dragon with gold spikes around face, smooth scales, mushroom-shaped flames.", category: "monster" },
  { name: "Common Welsh Green", description: "A green dragon with a distinctive roar, relatively docile, blends into grass.", category: "monster" },
  { name: "Basilisk", description: "An enormous serpent with brilliant green skin, venomous fangs, deadly yellow eyes. King of serpents.", category: "monster" },
  { name: "Acromantula", description: "A giant spider with eight eyes, thick hairy legs, massive pincers, can speak. Aragog's species.", category: "monster" },
  { name: "Aragog", description: "A massive blind acromantula, grey with age, many offspring, patriarch of the colony.", category: "monster" },
  { name: "Dementor", description: "A tall hooded figure, rotting scabbed hands, no visible face, sucks out happiness. Ragged black cloak.", category: "monster" },
  { name: "Boggart", description: "A shape-shifter showing as darkest fear. True form unknown. Currently shown as spectral mist.", category: "monster" },
  { name: "Grindylow", description: "A small green water demon with horns, long spindly fingers, sharp teeth. Lives in lakes.", category: "monster" },
  { name: "Merpeople", description: "Grey-skinned underwater beings with green hair, yellow eyes, silver fish tails. Hold tridents.", category: "creature" },
  { name: "Giant Squid", description: "An enormous friendly squid in Hogwarts lake with many tentacles, intelligent.", category: "creature" },
  { name: "Werewolf", description: "A wolf-like humanoid with elongated snout, claws, hunched posture, grey fur. Full moon form.", category: "monster" },
  { name: "Inferius", description: "A reanimated corpse with milky white eyes, grey skin, moving in jerky motions. Dark magic creation.", category: "monster" },
  { name: "Red Cap", description: "A small dwarf-like creature with red cap (dipped in blood), lives in old battlegrounds.", category: "monster" },
  { name: "Hinkypunk", description: "A one-legged wispy creature with a lantern, lures travelers into bogs.", category: "monster" },
  { name: "Cornish Pixie", description: "A tiny electric blue creature with pointed face, shrill voice, mischievous. Causes chaos.", category: "monster" },
  { name: "Blast-Ended Skrewt", description: "A horrible hybrid creature with armored shell, stinger, and fire-propelling rear end.", category: "monster" },
  
  // Magical Creatures - Friendly/Neutral
  { name: "Fawkes", description: "A phoenix with brilliant crimson and gold plumage, long golden tail, black talons. Dumbledore's companion.", category: "creature" },
  { name: "Buckbeak", description: "A proud hippogriff with grey feathered eagle head, gleaming orange eyes, horse body.", category: "creature" },
  { name: "Hedwig", description: "A snowy owl with white feathers, amber eyes, intelligent expression. Harry's owl.", category: "creature" },
  { name: "Pigwidgeon", description: "A tiny hyperactive grey owl, always excited, Ron's owl.", category: "creature" },
  { name: "Errol", description: "An ancient grey owl, disheveled feathers, often crashes. The Weasley family owl.", category: "creature" },
  { name: "Scabbers", description: "A fat grey rat with a missing toe, actually Peter Pettigrew. Looks old and mangy.", category: "creature" },
  { name: "Crookshanks", description: "A ginger cat with squashed face, bottle-brush tail, bow legs. Part Kneazle.", category: "creature" },
  { name: "Trevor", description: "A toad belonging to Neville, always escaping. Brown and warty.", category: "creature" },
  { name: "Mrs. Norris", description: "A skeletal grey cat with bulging yellow lamp-like eyes. Filch's cat, prowls corridors.", category: "creature" },
  { name: "Thestral", description: "A skeletal winged horse, only visible to those who've seen death. Black, white eyes, leathery wings.", category: "creature" },
  { name: "Hippogriff", description: "A magical creature with eagle head and horse body, proud bearing, must bow to approach.", category: "creature" },
  { name: "Niffler", description: "A fluffy black creature with long snout, attracted to shiny things, duck-billed platypus-like.", category: "creature" },
  { name: "Bowtruckle", description: "A small stick-like creature that guards wand-wood trees, twig-like fingers, green.", category: "creature" },
  { name: "Flobberworm", description: "A brown worm with no distinguishing features, extremely boring, used in potions.", category: "creature" },
  { name: "Mandrake", description: "A baby plant creature with wrinkled brown body, tufty green hair. Cry is fatal when mature.", category: "creature" },
  { name: "Nagini", description: "An enormous green snake with diamond patterns, Voldemort's Horcrux, intelligent and deadly.", category: "monster" },
  
  // Portraits and Magical Objects (with personalities)
  { name: "The Fat Lady", description: "A portrait of a large woman in pink silk dress, guards Gryffindor Tower, dramatic personality.", category: "portrait" },
  { name: "Sir Cadogan", description: "A portrait of a small knight in armor, rides a fat grey pony, very brave but foolish.", category: "portrait" },
  { name: "The Sorting Hat", description: "A patched, frayed, extremely old wizard's hat, able to speak and sing, places students in houses.", category: "magical_object" },
];

// Categories for filtering
export const CHARACTER_CATEGORIES = {
  students: CANON_CHARACTERS.filter(c => c.category === "student"),
  staff: CANON_CHARACTERS.filter(c => c.category === "staff"),
  ghosts: CANON_CHARACTERS.filter(c => c.category === "ghost"),
  adults: CANON_CHARACTERS.filter(c => c.category === "adult"),
  creatures: CANON_CHARACTERS.filter(c => c.category === "creature"),
  monsters: CANON_CHARACTERS.filter(c => c.category === "monster"),
  villains: CANON_CHARACTERS.filter(c => c.category === "villain"),
  historical: CANON_CHARACTERS.filter(c => c.category === "historical"),
  portraits: CANON_CHARACTERS.filter(c => c.category === "portrait"),
  magicalObjects: CANON_CHARACTERS.filter(c => c.category === "magical_object"),
};
