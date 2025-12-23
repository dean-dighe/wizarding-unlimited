# Hogwarts Unlimited

## Overview

A Harry Potter-themed text adventure game built as a full-stack web application. Players create a character, optionally choose a Hogwarts house, and embark on an interactive narrative experience powered by AI. The game uses conversational AI to generate dynamic story content with player choices, maintaining game state like health, inventory, and location throughout the adventure.

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
- **Image Generation**: Replit AI Integrations with `gpt-image-1` model (via `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`)
- **Streaming**: Server-sent events for real-time AI response streaming
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
- **Replit AI Integrations** - Image generation
  - Environment: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`

### Third-Party Libraries
- **Drizzle ORM** + **drizzle-zod** - Database ORM with Zod schema generation
- **TanStack React Query** - Server state management
- **Radix UI** - Accessible UI primitives (via shadcn/ui)
- **Framer Motion** - Animations
- **Zod** - Runtime validation for API inputs/outputs
- **p-limit** / **p-retry** - Rate limiting and retry logic for batch processing

### Fonts (External)
- Google Fonts: Cinzel, DM Sans, Architects Daughter, Crimson Text, EB Garamond, Fira Code, Geist Mono