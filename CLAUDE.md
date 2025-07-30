# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Build**: `npm run build` - Builds the extension using Vite, copies static files to dist/
- **Development**: `npm run dev` - Starts Vite development server (limited use for extension development)
- **Lint**: `npm run lint` - Runs ESLint on TypeScript/JSX files
- **Preview**: `npm run preview` - Previews the built application

## Architecture Overview

This is a Chrome extension for X.com (Twitter) that provides AI-powered tweet assistance via the xthreads.app API. The extension consists of three main components:

### Core Files Structure
- **manifest.json**: Chrome extension manifest v3 with permissions for X.com, scripting, storage
- **background.js**: Service worker handling extension lifecycle, settings, stats, API validation
- **content.js**: Content script injected into X.com pages, handles tweet analysis and auto-replies
- **popup.js/popup.html**: Extension popup UI with three tabs (rewrite, thread, agent)
- **onboarding.js/onboarding.html**: First-time setup flow for API key configuration

### Key Architecture Patterns

**State Management**: 
- Chrome storage API for persistent settings (`xthreads_settings`, `xthreads_stats`)
- Settings include: API key, keywords, tone, mode (manual/auto), active status

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
- **Vite** with React for popup development (src/ directory)
- **vite-plugin-static-copy** copies extension files to dist/
- **ESLint** with TypeScript and React plugins
- **Tailwind CSS** for styling

### API Integration
- **xthreads.app API** endpoints:
  - `/api/ai-reply` - Generate tweet replies
  - `/api/rewrite` - Rewrite existing tweets
  - `/api/thread` - Generate tweet threads
- API key stored securely in Chrome storage, validated on first use

### Extension Permissions
- `activeTab`, `scripting`: Content script injection
- `storage`: Settings and stats persistence  
- `tabs`: Tab management for posting
- `declarativeContent`: Conditional activation
- Host permissions for `xthreads.app` API calls

## Development Notes

- Extension targets X.com and Twitter.com domains
- Uses Chrome Extension Manifest V3
- Content script uses mutation observers to detect new tweets
- Popup built with vanilla JS (not the React in src/ - that appears unused)
- All static extension files are copied during build, not bundled