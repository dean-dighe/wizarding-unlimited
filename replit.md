# Hogwarts Unlimited

## Overview
Hogwarts Unlimited is a dark, morally complex text adventure game set in the Harry Potter universe. Players assume the role of a third-year Hogwarts student in 1993, who has been secretly recruited into a clandestine society led by a mysterious professor. The game focuses on five escalating trials designed to test the player's secrecy, cunning, loyalty, resolve, and cruelty, culminating in the reward of learning the Killing Curse (Avada Kedavra). The narrative emphasizes tension, moral ambiguity, and player complicity, ensuring choices have significant weight and the story maintains an unsettling tone. The game tracks player traits, relationships, and sacrifices, never allowing the player to feel safe or righteous.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
A React SPA built with TypeScript and Vite. It uses Wouter for routing, TanStack React Query for state management, and Tailwind CSS for styling with a custom magical theme. UI components are built with shadcn/ui (Radix UI primitives), and Framer Motion handles animations. The frontend includes a visual novel scene system with AI-generated backgrounds and character portraits, a responsive design for desktop and mobile, and a Phaser.js-based Overworld system for top-down exploration.

### Backend
An Express.js server in TypeScript, following a REST API pattern with Zod for validation. Key functionalities include game initialization, state management, chat and message handling, AI image generation, and NPC interaction for the overworld.

### Data Storage
PostgreSQL is used as the primary database, accessed via Drizzle ORM. The schema includes tables for conversations, messages, game states (player data, inventory, location), location maps, character sprites, and comprehensive RPG system tables such as combat spells, player profiles, items, companions, and quests.

### RPG System
Implements Pokemon-style RPG mechanics adapted to the Harry Potter universe, featuring magical disciplines, a combat system with numerous spells (including Unforgivable Curses), player profiles with stats and progression, items, companions, and a quest system. It includes API routes for seeding and fetching RPG data.

### AI Integration
Utilizes an OpenAI-compatible API for story generation and narration. xAI Grok Aurora is used for generating fantasy book-style scene illustrations and character portraits, while xAI Grok Voice Agent API provides text-to-speech narration with a distinct persona. The system includes features for consistent NPC character tracking across narratives and images, streaming AI responses via server-sent events, and batch processing for API calls.

### Translation Layer
A coordinated pipeline architecture that extracts structured scene data (location, characters, mood, choices) from AI-generated narrative text. It uses AI to parse narrative into a ScenePayload format, resolves assets (backgrounds, portraits) from a cached registry, and orchestrates TTS generation, buffering all components before delivering a complete scene to the frontend.

### Game Asset System
Manages AI-generated game assets, including character sprite sheets (from xAI Grok Aurora) and Tiled-compatible JSON tilemaps for locations. Assets are stored in Replit Object Storage, with metadata in PostgreSQL. The system supports async generation with status tracking, caching, and pre-generation of backgrounds for common Harry Potter locations.

### Project Structure
Organized into `client/` (React frontend), `server/` (Express backend with Replit integrations for chat, image, TTS, story, game assets, and object storage), `shared/` (common types, schemas, routes), and `migrations/` (Drizzle migrations).

### Build System
Uses `tsx` for development and `esbuild` for server bundling, `Vite` for client bundling in production. Drizzle-kit handles database migrations.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, `DATABASE_URL` for connection.
- **connect-pg-simple**: Session storage.

### AI Services
- **OpenAI-compatible Chat API**: For story generation. Configured via `OLLAMA_API_KEY`, `OLLAMA_BASE_URL`.
- **xAI Grok**: `grok-2-image-1212` for image generation and `Voice Agent API (Ara voice)` for TTS. Configured via `XAI_API_KEY`.

### Third-Party Libraries
- **Drizzle ORM** + **drizzle-zod**: Type-safe database operations.
- **TanStack React Query**: Server state management.
- **Radix UI**: Accessible UI primitives (via shadcn/ui).
- **Framer Motion**: UI animations.
- **Zod**: Runtime validation for API schemas.
- **p-limit / p-retry**: For rate-limited and retried API calls.

### Fonts
- **Google Fonts**: Cinzel, DM Sans, Architects Daughter, Crimson Text, EB Garamond, Fira Code, Geist Mono.