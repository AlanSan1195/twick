# Rocket Chat Simulator – Product Requirements Document

## Overview
Rocket Chat Simulator is a web application that allows streamers (Twitch/Kick) to practice with a simulated audience. The app uses AI (Groq + Cerebras) to generate realistic chat messages for video games and Just Chatting sessions, then streams them via SSE to a virtualized chat window.

Production URL: https://twick.dev  
Language: Spanish (es-MX)

---

## Core Features

### 1. Platform Theme Toggle
Users can switch between Twitch (purple #9146FF) and Kick (green #53FC18) color themes. The preference is stored in localStorage and restored on next visit.

### 2. Authentication (Clerk)
- Sign in / Sign up via Clerk components at /sign-in and /sign-up
- After auth, users are redirected to /dashboard
- All API routes and /dashboard are protected; unauthenticated users are redirected to /sign-in
- Dashboard header shows Clerk UserButton for account management and sign out

### 3. Stream Mode Toggle
On the dashboard, users switch between two modes:
- **Game mode**: enter a video game name
- **Just Chatting mode**: enter a conversation topic

Switching mode while streaming is disabled (button shows tooltip).

### 4. Game Input & AI Phrase Generation
- Text input (2–50 chars) for a video game name
- Submitting calls POST /api/generate-phrases
- Success: game chip added, phrases cached server-side
- Errors: invalid game (AI rejects), 4-game limit reached, network error
- Up to 4 games per user (in-memory, per server instance)

### 5. Just Chatting Topic Input
- Text input (2–60 chars) for a conversation topic
- 8 preset topic chips: Mi vida, Música, Viajes, Tecnología, Películas y series, Comida, Deporte, Anime
- Clicking a chip fills and submits immediately
- Calls POST /api/generate-phrases with mode: 'justchatting'

### 6. Message Speed Selector
4 preset speed buttons (disabled while streaming):
- 4–7 seg
- 2–4 seg (default)
- 1–2 seg
- 0.5–1 seg

### 7. Stream Playback Controls
- **Play**: starts SSE connection to GET /api/chat-stream, clears messages
- **Pause**: closes SSE without clearing messages
- **Resume**: reconnects SSE from current message list
- **Stop**: closes SSE and clears all messages
- Header label reflects current state: "Streaming: {game}", "En pausa: {game}", "No hay stream activo"

### 8. Virtualized Chat Window
- Empty state: SVG icon + hint text when no messages
- Auto-scrolls to latest message
- Messages rendered by react-virtuoso (only visible rows in DOM)
- Max 200 messages stored; older ones are dropped

### 9. Chat Messages with SevenTV Emotes
Each message shows:
- Username with deterministic color (11 color options)
- Timestamp (HH:MM:SS relative to stream start)
- Message content
- Optional SevenTV emote image (50% probability; cached 5 min, deduplication)

### 10. User Game Limit (4 games)
- Global per-user limit of 4 registered games/topics
- GET /api/generate-phrases returns current list and remaining slots
- Dashboard restores user's games on mount

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/generate-phrases | Yes | Generate AI phrases for a game/topic |
| GET | /api/generate-phrases | Yes | Get user's registered games and slots |
| GET | /api/chat-stream | Yes (middleware) | SSE stream of timed chat messages |

---

## Non-Functional Requirements
- SSR on Vercel via @astrojs/vercel adapter
- Strict CSP headers (X-Frame-Options: DENY, etc.)
- In-memory caches reset on cold start (no database)
- Astro middleware enforces auth for /dashboard and /api/*
