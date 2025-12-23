# Hogwarts Unlimited

## Overview

A Harry Potter-themed text adventure game built as a full-stack web application. Players create a character, choose a Hogwarts house, and embark on an interactive narrative experience powered by AI as a **third-year student (1993)**. The game uses conversational AI to generate dynamic story content with player choices, maintaining game state like health, inventory, spells, and location throughout the adventure.

**Year 3 Features:**
- Players start with 9 spells learned from Years 1-2 (Lumos, Nox, Wingardium Leviosa, Alohomora, Reparo, Incendio, Flipendo, Expelliarmus, Rictusempra)
- Starting inventory includes: Wand, Hogwarts Robes, Spellbook Collection, Cauldron, Broomstick, Signed Hogsmeade Permission Slip
- Narrative reflects established student with existing friendships, knowledge of castle, and Year 3 privileges (electives, Hogsmeade)

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
- **Responsive Design**:
  - Mobile: Story paragraphs collapse to 1 line with "Tap to read" hint, tap to expand
  - Desktop: Full text displayed, no collapse UI
  - Scene images appear BELOW story text (narrator-first focus)

### Backend Architecture
- **Express.js** server with TypeScript
- **API Pattern**: REST endpoints defined in `shared/routes.ts` with Zod schemas for validation
- **Key Routes**:
  - `/api/game/init` - Initialize new game with player name and optional house
  - `/api/game/:conversationId/state` - Get current game state
  - `/api/conversations/*` - Chat/message management
  - `/api/generate-image` - AI image generation

### Data Storage
- **PostgreSQL** database via `DATABASE_URL` environment variable
- **Drizzle ORM** for type-safe database operations
- **Schema Location**: `shared/schema.ts` and `shared/models/chat.ts`
- **Key Tables**:
  - `conversations` - Chat sessions
  - `messages` - Individual messages with role (user/assistant/system)
  - `game_states` - Game-specific data linked to conversations (house, health, inventory, location, game time)

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

### Project Structure
```
client/           # React frontend
  src/
    components/ui/  # shadcn components
    hooks/          # Custom React hooks
    pages/          # Route components
    lib/            # Utilities
server/           # Express backend
  replit_integrations/  # AI service modules (chat, image, batch)
shared/           # Shared types, schemas, routes
  models/         # Database models
  schema.ts       # Drizzle schema
  routes.ts       # API route definitions with Zod
migrations/       # Drizzle migrations
```

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