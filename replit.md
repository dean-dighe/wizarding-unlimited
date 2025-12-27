# Hogwarts Unlimited

## Overview

A **dark, morally complex** Harry Potter text adventure game. Players are third-year students (1993) who have been recruited into a **secret society** operating within Hogwarts, led by a professor whose public persona betrays nothing of their true nature.

**Core Premise:**
- Story begins **IN MEDIAS RES** - player is mid-trial when game starts
- No exposition about the society, professor, or how they got here
- Player must complete **5 escalating trials** to prove worthiness
- The ultimate reward: being taught the **Killing Curse (Avada Kedavra)**
- Tone is dark, tense, morally ambiguous - choices have weight, trust is scarce

**The 5 Trials:**
1. **SECRECY** - Prove you can keep silent. Low stakes, high tension.
2. **CUNNING** - Outmaneuver another inductee. Only one advances.
3. **LOYALTY** - Protect someone or sacrifice them for standing.
4. **RESOLVE** - Endure something that breaks lesser students.
5. **CRUELTY** - Do something unforgivable to earn the final reward.

**Narrative Rules:**
- MAINTAIN: Tension, professor authority (never flustered), player complicity
- TRACK: Player traits (cruel/merciful, loyal/ambitious, bold/cautious), relationships, sacrifices
- NEVER: Let player feel safe/righteous, make success feel clean, break professor mystery early
- ALWAYS: End with unease/momentum, give NPCs their own motivations

**Writing Style:** Tight. Short. Visceral. Fragments OK. Sensory over exposition.

**Year 3 Student Context:**
- Players have 9 spells from Years 1-2 (Lumos, Nox, Wingardium Leviosa, Alohomora, Reparo, Incendio, Flipendo, Expelliarmus, Rictusempra)
- Starting inventory: Wand, Hogwarts Robes, Society Binding Mark
- Starting location: The Undercroft (hidden chamber beneath Hogwarts)
- **Spell restriction**: AI only offers spells from player's known spells list
- **Spell styling**: Choices with known spells get wand icon + blue gradient

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React SPA** with TypeScript, bundled by Vite
- **Routing**: Wouter for lightweight client-side routing (Landing page at `/`, Game at `/game/:id`)
- **State Management**: TanStack React Query for server state and caching
- **Styling**: Tailwind CSS with a custom magical/parchment theme, CSS variables for theming (light/dark modes)
- **UI Components**: shadcn/ui component library (Radix UI primitives) stored in `client/src/components/ui/`
- **Animations**: Framer Motion for magical UI effects
- **Custom Hooks**: 
  - `use-game.ts` - Game state and initialization
  - `use-chat-stream.ts` - Streaming AI responses and message history
  - `use-coordinated-chat.ts` - Buffered all-at-once AI responses with loading state
  - `use-game-canvas.ts` - Phaser.js game canvas data fetching
- **Visual Novel Scene System (December 2024)**:
  - `SceneStage.tsx` - Visual novel style scene renderer
  - AI-generated background images for each location via xAI Grok Aurora
  - Character portraits with expression variants (neutral, happy, sad, angry, surprised, worried, determined, mysterious, scared)
  - Characters overlay on backgrounds based on scene composition
  - Smooth transitions using Framer Motion
  - Async generation with status polling and proper cleanup
- **Character Portrait System (December 2024)**:
  - `character_portraits` table stores VN-style character art
  - Multiple expressions per character (9 expression types)
  - Canon character definitions with description and traits
  - `appearanceSignature` hash for reuse detection
  - Portraits generated via xAI Grok Aurora with VN art style prompts
- **Responsive Design (Refactored December 2024)**:
  - **Desktop (lg+)**: Two-column layout - fixed canvas (480x360) on left, scrollable story on right
  - **Mobile/Tablet**: Stacked layout - canvas on top, scrollable story, sticky choice panel at bottom
  - Compact inline header bar with house icon, player name, health, location, time
  - Expandable detail drawer on mobile for inventory/spells/story progress
  - Responsive typography with clamp() for story text (15px-18px)
  - Larger touch targets (52px min height) for choice buttons
  - Choice buttons highlighted with spell detection (blue gradient + wand icon for known spells)
- **Component Structure**:
  - `StatBadge` - Compact inline stat display for header
  - `DetailPanel` - Mobile-only expandable stats drawer
  - `ChoicePanel` - Styled choice buttons with spell highlighting
- **Overworld System (December 2024)**:
  - `OverworldCanvas.tsx` - Phaser.js-based Pokemon-style top-down exploration
  - 480x360 game canvas with procedural Undercroft map
  - WASD/arrow key movement with collision detection
  - Interactive objects: NPCs, items, examine points, triggers
  - Proximity-based interaction (50px range, E/Space to interact)
  - Dialogue overlay with pause/resume movement
  - Uses refs to prevent Phaser re-initialization on React state changes
  - `OverworldDemo.tsx` - Demo page at `/overworld` route
  - `use-overworld-npc.ts` - Hook for AI-powered NPC dialogue

### Backend Architecture
- **Express.js** server with TypeScript
- **API Pattern**: REST endpoints defined in `shared/routes.ts` with Zod schemas for validation
- **Key Routes**:
  - `/api/game/init` - Initialize new game with player name and optional house
  - `/api/game/:conversationId/state` - Get current game state
  - `/api/conversations/*` - Chat/message management
  - `/api/generate-image` - AI image generation
  - `/api/overworld/npc-interact` - Lightweight NPC dialogue for overworld mode (POST with conversationId, npcName, playerChoice)

### Data Storage
- **PostgreSQL** database via `DATABASE_URL` environment variable
- **Drizzle ORM** for type-safe database operations
- **Schema Location**: `shared/schema.ts` and `shared/models/chat.ts`
- **Key Tables**:
  - `conversations` - Chat sessions
  - `messages` - Individual messages with role (user/assistant/system)
  - `game_states` - Game-specific data linked to conversations (house, health, inventory, location, game time)
  - `location_maps` - Generated map metadata (tilesetUrl, tilemapData JSON, generationStatus, spawnPoints) - game-wide persistence
  - `character_sprites` - Generated sprite metadata (spriteSheetUrl, animationConfig) - game-wide persistence

### AI Integration
- **Chat**: OpenAI-compatible API (configured via `OLLAMA_API_KEY` and `OLLAMA_BASE_URL`)
- **Image Generation**: xAI Grok Aurora (`grok-2-image-1212`) via `XAI_API_KEY` - generates fantasy book-style scene illustrations
  - Prompts capped at 1000 chars to stay under API limit
  - Includes character description for visual consistency
- **Text-to-Speech**: xAI Grok Voice Agent API (Ara voice) via WebSocket for narration
  - Route: `/api/tts/speak` - converts text to WAV audio
  - Narrator persona: Age-appropriate magical storyteller for first-year Hogwarts students
  - PERFORMS paralinguistic cues (sighs, gasps) rather than reading them literally
  - Frontend auto-plays final paragraph after story renders
  - Mute toggle with localStorage persistence
  - Atomic locking prevents duplicate TTS calls during React re-renders
- **Character Descriptions**: Generated on game init (80-100 words) for consistent character appearance across images
- **NPC Character Tracking**: AI uses [CHARACTER: Name | Description] tags to describe new non-canon characters
  - Descriptions stored in `game_states.npcDescriptions` (JSONB)
  - `findRelevantNPCs()` matches NPCs by full name, first name, or newly-introduced status
  - Image prompts include protagonist + relevant NPCs (max 2, 80 chars each) for visual consistency
- **Streaming**: Server-sent events for buffered AI response delivery
  - Error handling with automatic rollback on AI failures
  - Structured SSE error events with retry capability
  - User message deleted from DB on AI failure to maintain consistency
- **Batch Processing**: Utility module for rate-limited parallel API calls with retries

### Translation Layer (December 2024)
New coordinated pipeline architecture for all-at-once reveal:
- **TranslatorService** (`server/replit_integrations/translator/service.ts`)
  - Extracts structured scene data (location, characters, mood, choices) from narrative text
  - Uses AI to parse narrative into JSON ScenePayload format
  - Fallback regex extraction when AI parsing fails
  - Cleans narrative text of metadata tags ([HEALTH:], [ITEM_ADD:], etc.)
- **AssetRegistry** (`server/replit_integrations/translator/assetRegistry.ts`)
  - LRU-cached catalog of backgrounds/portraits from database
  - 60-second TTL on cache, invalidation on demand
  - Fuzzy matching with Levenshtein distance (70% confidence threshold)
  - Normalizes location/character names for matching
- **AssetResolver** (`server/replit_integrations/translator/assetResolver.ts`)
  - Matches narrative references to existing DB assets
  - Determines use/generate action for each background and portrait
  - Waits for pending asset generation with configurable timeout
- **CoordinatedPipeline** (`server/replit_integrations/translator/coordinatedPipeline.ts`)
  - Orchestrates: AI narrative → scene extraction → asset resolution → TTS generation
  - Buffers everything before returning single response
  - Triggers background/portrait generation for missing assets
- **Frontend Integration**:
  - `use-coordinated-chat.ts` - Hook for buffered responses with loading state
  - Game.tsx supports both streaming and coordinated modes via USE_COORDINATED_MODE flag
  - Loading overlay shows "Weaving the story..." during preparation
- **API Endpoint**: `/api/conversations/:id/coordinated`
  - Returns complete scene with assets resolved, TTS URL, and story progress
  - Automatic rollback of user message on pipeline failure

### Project Structure
```
client/           # React frontend
  src/
    components/
      ui/         # shadcn components
      game/       # Game-specific components (GameCanvas)
    hooks/        # Custom React hooks
    pages/        # Route components
    lib/          # Utilities
server/           # Express backend
  replit_integrations/
    chat/         # AI chat/story services
    image/        # Scene image generation
    tts/          # Text-to-speech narration
    story/        # Story arc generation
    game_assets/  # Sprite and map generation
    object_storage/ # Replit Object Storage integration
shared/           # Shared types, schemas, routes
  models/         # Database models
  schema.ts       # Drizzle schema (includes location_maps, character_sprites)
  routes.ts       # API route definitions with Zod
migrations/       # Drizzle migrations
```

### Game Asset System
- **Sprite Generation**: xAI Grok Aurora generates 12-frame sprite sheets (4 directions x 3 frames)
- **Map Generation**: AI-generated tilesets with Tiled-compatible JSON tilemaps
  - Async generation with status tracking (pending/generating/ready/failed)
  - 128x128px tilesets (4x4 grid of 32x32 tiles)
  - Procedural tilemap layers (ground + decorations)
  - Location-specific color schemes (Gryffindor=red/gold, Slytherin=green, etc.)
  - Frontend polls every 3s during generation, falls back to procedural graphics on failure
- **Asset Storage**: Replit Object Storage for binary assets, PostgreSQL for metadata and tilemap JSON
- **Caching**: Game-wide persistence - sprites/maps are reused across all players
- **Background Pre-generation (December 2024)**:
  - 30 Harry Potter locations with detailed prompts (Great Hall, all Common Rooms, classrooms, Forbidden Forest, Hogsmeade, etc.)
  - Batch pre-generation API with configurable concurrency
  - Object storage serving searches both public and private directories
- **API Routes**:
  - `GET /api/game-assets/sprite/:characterName` - Fetch character sprite
  - `POST /api/game-assets/sprite/generate` - Generate new sprite
  - `GET /api/game-assets/map/:locationName` - Fetch location map with generation status
  - `POST /api/game-assets/map/generate` - Trigger map generation
  - `POST /api/vn-assets/backgrounds/pregenerate` - Pre-generate all Harry Potter location backgrounds
  - `GET /api/vn-assets/backgrounds/status` - Get status of all background generation

### Build System
- **Development**: `tsx` for running TypeScript directly
- **Production**: esbuild bundles server, Vite bundles client
- **Database Migrations**: `drizzle-kit push` for schema sync

## External Dependencies

### Database
- **PostgreSQL** - Primary database, connection via `DATABASE_URL` environment variable
- **connect-pg-simple** - Session storage in PostgreSQL

### AI Services
- **OpenAI-compatible Chat API** - Story generation and game narration
  - Environment: `OLLAMA_API_KEY`, `OLLAMA_BASE_URL`
- **xAI Grok** - Image generation (grok-2-image-1212) and TTS (Voice Agent API with Ara voice)
  - Environment: `XAI_API_KEY`

### Third-Party Libraries
- **Drizzle ORM** + **drizzle-zod** - Database ORM with Zod schema generation
- **TanStack React Query** - Server state management
- **Radix UI** - Accessible UI primitives (via shadcn/ui)
- **Framer Motion** - Animations
- **Zod** - Runtime validation for API inputs/outputs
- **p-limit** / **p-retry** - Rate limiting and retry logic for batch processing

### Fonts (External)
- Google Fonts: Cinzel, DM Sans, Architects Daughter, Crimson Text, EB Garamond, Fira Code, Geist Mono