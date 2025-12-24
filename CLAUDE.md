# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hogwarts Unlimited is a Harry Potter-themed text adventure game. Players start as third-year Hogwarts students (1993) with AI-generated dynamic storytelling, spell casting, inventory management, and NPC tracking.

## Common Commands

```bash
npm run dev      # Start development server (port 5000)
npm run build    # Production build (Vite client + esbuild server)
npm run check    # TypeScript type checking
npm run db:push  # Push Drizzle schema changes to PostgreSQL
```

No test framework is configured.

## Architecture

### Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **AI**: OpenAI-compatible chat API, xAI Grok (images + TTS)

### Directory Structure
```
client/src/
  pages/           # Landing (/) and Game (/game/:id) pages
  hooks/           # use-game.ts, use-chat-stream.ts
  components/ui/   # shadcn/ui components

server/
  index.ts         # Express app setup
  routes.ts        # API route registration
  storage.ts       # Game state storage
  replit_integrations/
    chat/          # OpenAI chat integration
    image/         # xAI image generation
    tts/           # Text-to-speech WebSocket
    story/         # Story arc engine

shared/
  schema.ts        # Drizzle tables (conversations, messages, game_states)
  routes.ts        # API routes with Zod validation
  models/chat.ts   # Database models
```

### Key Data Flow
1. Landing page creates character → `/api/game/init` → new conversation + game state
2. Game page streams AI responses via Server-Sent Events
3. Chat messages and game state stored in PostgreSQL
4. NPC descriptions tracked in `game_states.npcDescriptions` (JSONB) for visual consistency

### AI Integration Details
- **Chat**: OpenAI-compatible API with streaming SSE responses
- **Images**: xAI Grok Aurora, prompts capped at 1000 chars, includes character descriptions
- **TTS**: xAI Voice Agent API via WebSocket, auto-plays final paragraph
- **NPC Tracking**: `[CHARACTER: Name | Description]` tags parsed and stored for consistent image generation

### Game Mechanics
- Year 3 students start with 9 spells (Lumos, Nox, Wingardium Leviosa, Alohomora, Reparo, Incendio, Flipendo, Expelliarmus, Rictusempra)
- AI restricted to only offering spells from player's known spells list
- Spell choices styled with wand icon and blue gradient

## Environment Variables

```
DATABASE_URL=postgresql://...
OLLAMA_API_KEY=ollama
OLLAMA_BASE_URL=https://gpt.netsuite.tech/v1
OLLAMA_MODEL=qwen3-coder:30b
XAI_API_KEY=...
```