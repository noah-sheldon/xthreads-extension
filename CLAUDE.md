# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Build**: `npm run build` - Builds the extension using Vite, copies static files to dist/
- **Development**: `npm run dev` - Starts Vite development server (limited use for extension development)
- **Lint**: `npm run lint` - Runs ESLint on TypeScript/JSX files
- **Preview**: `npm run preview` - Previews the built application

## Architecture Overview

This is a Chrome extension for X.com (Twitter) that provides AI-powered content creation and automated replies via the xthreads.app API. The extension features a modern unified interface with conversation-style interactions.

### Core Files Structure

- **manifest.json**: Chrome extension manifest v3 (version 1.0.1) with permissions for X.com, scripting, storage
- **background.js**: Service worker handling extension lifecycle, settings, stats, API validation
- **content.js**: Content script injected into X.com pages, handles tweet analysis and auto-replies
- **popup.js/popup.html**: Unified popup interface with dropdown selector (generate/rewrite/thread)
- **popup.css**: Modern teal/white themed styles with gradient cards and hover effects
- **onboarding.js/onboarding.html**: First-time setup flow for API key configuration

### Key Architecture Patterns

**Unified Interface System**:
- Single conversation-style chat interface
- Action dropdown selector: Generate, Rewrite, Threads
- Modern card-based design with teal gradient headers
- Character counters with color-coded limits (green/yellow/red)

**State Management**:
- Chrome storage API for persistent settings (`xthreads_settings`, `xthreads_stats`)
- 24-hour conversation history persistence (`xthreads_conversation_history`)
- Settings include: API key, brand space, tone, onboarding status

**Communication Flow**:
- Popup ↔ Background: `chrome.runtime.sendMessage()` for settings/stats
- Popup ↔ Content: `chrome.tabs.sendMessage()` for UI actions
- Content → Background: Stats updates and API key validation

**Content Script Features**:
- Tweet analysis and keyword matching
- Rate limiting (20s between replies, max 60/hour)
- Activity tracking (pauses when user inactive >5min)
- DOM manipulation for overlay buttons and reply automation

### Build System

- **Vite** with React for popup development (src/ directory - currently unused)
- **vite-plugin-static-copy** copies extension files to dist/
- **ESLint** with TypeScript and React plugins
- **Tailwind CSS** for styling
- Vanilla JavaScript popup implementation

### API Integration

**xthreads.app API endpoints**:
- `/api/generate-tweet` - Create original tweets from prompts
- `/api/rewrite-content` - Transform existing content (expects `originalContent` parameter)
- `/api/generate-thread` - Create tweet threads
- `/api/ai-reply` - Generate replies to existing tweets

**API Response Formats**:
- Generate: `{ tweet: string }`
- Rewrite: `{ rewrittenContent: string }`
- Thread: `{ thread: string[] }`
- Reply: `{ tweet: string }`

**Authentication**:
- API key stored securely in Chrome storage
- Validated on first use and passed via `x-api-key` header

### Extension Permissions

- `activeTab`, `scripting`: Content script injection
- `storage`: Settings and conversation persistence  
- `tabs`: Tab management for posting
- `notifications`: User notifications
- Host permissions for `xthreads.app` and `x.com/twitter.com` domains

### UI/UX Design

**Modern Card Design**:
- Teal (#14b8a6) and white color palette
- Gradient backgrounds with subtle shadows
- Hover effects with elevation changes
- Professional typography and spacing

**Interactive Elements**:
- Dynamic character counters with color coding
- Copy buttons with proper SVG icons
- Smooth transitions and animations
- Responsive hover states

**Content Types**:
- **Generated Tweets**: Star icon badge, single card format
- **Rewritten Content**: Edit icon badge, single card format  
- **Thread Tweets**: Numbered badges, individual card format with copy buttons

## Development Notes

- Extension targets X.com and Twitter.com domains
- Uses Chrome Extension Manifest V3
- Content script uses mutation observers to detect new tweets
- Popup built with vanilla JavaScript (React in src/ unused)
- All static extension files are copied during build, not bundled
- Comprehensive debugging added throughout unified system
- Old tab-based system completely removed for clean codebase
