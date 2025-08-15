# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenCut is a free, open-source video editor built with Next.js 15. It's a privacy-focused alternative to CapCut that runs entirely in the browser with no watermarks or subscriptions. The application uses FFmpeg.wasm for video processing and features a timeline-based editing interface.

## Development Commands

### Root Level Commands (monorepo)
- `bun dev` - Start all applications in development mode using Turbo
- `bun build` - Build all applications
- `bun check-types` - Run TypeScript type checking across the monorepo
- `bun lint` - Run Ultracite linter (configured with Biome)
- `bun format` - Format code using Ultracite

### Web App Commands (apps/web)
- `bun dev` - Start Next.js development server with Turbopack
- `bun build` - Build the Next.js application
- `bun start` - Start production server
- `bun lint` - Run Biome linter on src/ directory
- `bun lint:fix` - Run Biome linter with auto-fix
- `bun format` - Format code with Biome
- `bun run db:generate` - Generate Drizzle database migrations
- `bun run db:migrate` - Run database migrations
- `bun run db:push:local` - Push schema to local development database
- `bun run db:push:prod` - Push schema to production database

### Testing
- Look for test files in `src/stores/__tests__/` for existing test patterns
- No global test command configured - check individual test files for framework usage

## Architecture Overview

### Monorepo Structure
- **apps/web/**: Main Next.js application (video editor)
- **apps/transcription/**: Python transcription service
- **packages/**: Shared packages (auth, db)

### Key Technologies
- **Frontend**: Next.js 15, React 18, TypeScript
- **State Management**: Zustand stores with persistence
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Better Auth
- **Video Processing**: FFmpeg.wasm
- **UI Components**: Radix UI with custom components
- **Styling**: Tailwind CSS
- **Package Manager**: Bun
- **Build Tool**: Turbo (monorepo), Next.js with Turbopack

### State Management Architecture
The application uses Zustand for state management with these core stores:
- `editor-store.ts`: Editor initialization and canvas presets
- `timeline-store.ts`: Timeline data and operations  
- `playback-store.ts`: Video playback controls
- `media-store.ts`: Media files and assets
- `project-store.ts`: Project management
- `keybindings-store.ts`: Keyboard shortcuts configuration
- `panel-store.ts`: UI panel states
- `sounds-store.ts`: Audio/sound effects

### Component Architecture
- **Editor Components**: Located in `src/components/editor/`
  - Timeline interface with track management
  - Media panel with drag-and-drop functionality
  - Properties panel for element editing
  - Preview panel for video output
- **UI Components**: Reusable components in `src/components/ui/`
- **Custom Hooks**: Editor-specific logic in `src/hooks/`

## Code Quality Standards

This project follows strict coding standards enforced by Ultracite (using Biome):

### Key Requirements
- **TypeScript**: Strict type safety, no `any` types
- **React**: No React imports needed, use fragments `<>...</>` instead of `<Fragment>`
- **Accessibility**: Always include proper ARIA attributes, button types, and keyboard handlers
- **Next.js**: Use `next/image` instead of `<img>`, avoid `<head>` elements
- **Performance**: Use `for...of` instead of `Array.forEach`, prefer `.flatMap()` over `.map().flat()`

### Database Schema
- Uses Drizzle ORM with PostgreSQL
- Migration files in `apps/web/migrations/`
- Schema definitions in packages structure

## Environment Setup

### Required Environment Variables (apps/web/.env.local)
```bash
# Database
DATABASE_URL="postgresql://opencut:opencutthegoat@localhost:5432/opencut"

# Authentication
BETTER_AUTH_SECRET="your-generated-secret"
BETTER_AUTH_URL="http://localhost:3000"

# Redis
UPSTASH_REDIS_REST_URL="http://localhost:8079"
UPSTASH_REDIS_REST_TOKEN="example_token"

# CMS
MARBLE_WORKSPACE_KEY="workspace-key"
NEXT_PUBLIC_MARBLE_API_URL="https://api.marblecms.com"
```

### Local Development Setup
1. Run `docker-compose up -d` from project root (for database/Redis)
2. Navigate to `apps/web`
3. Copy `.env.example` to `.env.local` and configure
4. Run `bun install`
5. Run `bun run db:migrate`
6. Run `bun dev`

## Contributing Guidelines

**Current Focus Areas:**
- Timeline functionality and performance
- Project management features
- Bug fixes and UI improvements
- Keyboard shortcuts and accessibility

**Areas to Avoid (under active refactoring):**
- Preview panel enhancements (fonts, stickers, effects)
- Export functionality (migrating to binary rendering)

The project prioritizes privacy (client-side processing) and aims to provide all basic video editing features without paywalls or watermarks.