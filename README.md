# xThreads Agent - Browser Extension

![xThreads Agent](assets/icon48.png)

**AI-powered content creation and automated reply generation for X.com using xThreads.app API**

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-blue?style=flat&logo=google-chrome)](https://chrome.google.com/webstore/)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Add--ons-orange?style=flat&logo=firefox)](https://addons.mozilla.org/)
[![Edge Add-ons](https://img.shields.io/badge/Edge-Add--ons-blue?style=flat&logo=microsoft-edge)](https://microsoftedge.microsoft.com/addons/)

## 🚀 Features

### **Smart Content Generation**
- **AI Tweet Generation**: Create engaging tweets from simple prompts using `/api/generate-tweet`
- **Content Rewriting**: Transform existing content with different tones using `/api/rewrite-content`
- **Thread Creation**: Generate multi-tweet threads automatically using `/api/generate-thread`
- **15+ Tone Options**: Professional, casual, witty, educational, inspirational, and more

### **Modern Interface**
- **Unified Chat Experience**: Single conversation-style interface for all content types
- **Action Dropdown**: Simple dropdown to switch between Generate, Rewrite, and Thread modes
- **Modern Card Design**: Teal-themed cards with gradient headers and hover effects
- **Character Counters**: Real-time character counting with color-coded limits (280 chars)
- **24-Hour Conversation History**: Messages persist for 24 hours with automatic cleanup

### **Professional Workflow**
- **Copy-to-Clipboard**: Reliable workflow with proper copy buttons and toast notifications
- **Brand Management**: Multiple brand space support via xThreads.app API integration
- **Usage Tracking**: Monitor your daily content generation statistics
- **Persistent Storage**: All data stored securely in your browser using Chrome Storage API

### **Enhanced UX**
- **Seamless Integration**: xThreads button appears next to X.com reply buttons
- **AI Warning Banner**: Clear indication that content is AI-generated
- **Smart History**: Content history organized by type (Generated/Rewritten/Threads)
- **Responsive Design**: Modern UI with smooth animations and transitions

## 📥 Installation

### Chrome Web Store
1. Visit the Chrome Web Store (link coming soon)
2. Click "Add to Chrome"
3. Complete the onboarding flow with your xThreads.app API key

### Firefox Add-ons
1. Visit Firefox Add-ons (link coming soon)
2. Click "Add to Firefox"
3. Complete the onboarding flow

### Microsoft Edge Add-ons
1. Visit Edge Add-ons (link coming soon)
2. Click "Get"
3. Complete the onboarding flow

## 🛠 Setup

### Prerequisites
- Active [xThreads.app](https://xthreads.app) account
- API key from your xThreads.app dashboard
- X.com (Twitter) account

### Initial Configuration
1. **Install Extension**: Add from your browser's extension store
2. **API Setup**: Enter your xThreads.app API key during onboarding
3. **Brand Selection**: Choose your brand space for content generation
4. **Keywords**: Set keywords for automated monitoring (optional)
5. **Preferences**: Configure tone and monitoring settings

## 📖 Usage Guide

### **Tweet Generation**
1. Click the xThreads extension icon
2. Select "Generate" from the action dropdown
3. Enter your prompt (e.g., "Write about building in public")
4. Select tone from the tone selector
5. Click "Send" - AI generates content in modern card format
6. Click "Copy" button on the generated tweet card
7. Paste into X.com compose window

### **Content Rewriting**
1. Click the xThreads extension icon
2. Select "Rewrite" from the action dropdown
3. Paste existing content into the input field
4. Choose new tone from selector
5. Click "Send" - AI rewrites content with new tone
6. Click "Copy" button on the rewritten content card
7. Use the improved version in X.com

### **Thread Creation**
1. Click the xThreads extension icon
2. Select "Threads" from the action dropdown
3. Enter long-form content or topic
4. Click "Send" - AI creates numbered thread
5. Individual tweet cards appear with copy buttons
6. Copy each tweet individually or use thread format
7. Post as Twitter thread

### **Manual Reply Generation**
1. Find a tweet you want to reply to on X.com
2. Click the xThreads button (appears next to reply button)
3. Extension popup opens with AI-generated reply
4. Review and copy the suggested reply
5. Paste into X.com reply field

### **Conversation History**
1. Click the history button (clock icon) in popup header
2. Browse Generated, Rewritten, and Threads tabs
3. Click "Load" to restore any previous content
4. History persists for 24 hours automatically
5. Use "Clear All History" to reset

## ⚙️ Configuration

### **Settings Panel**
- **API Key**: Your xThreads.app authentication
- **Brand Spaces**: Select active brand for content generation
- **Keywords**: Comma-separated terms for monitoring
- **Default Tone**: Choose from 15+ available tones

### **Agent System**  
- **One-Time Activation**: Click "Start Agent" for each scan session
- **Current Page Only**: No navigation - stays on page you're currently viewing
- **Deep Auto-Scroll**: Automatically scrolls down 10 times to load more content
- **Relaxed Filtering**: Targets tweets with 1-50 likes and <25 replies for more opportunities
- **Automatic Completion**: Agent stops after finding 10 opportunities or completing 10 scrolls

## 🔒 Privacy & Security

### **Data Storage**
- **Local Only**: All personal data stored in your browser
- **No Cloud Storage**: We don't store data on our servers
- **Encrypted**: Browser-native encryption for sensitive data

### **Data Usage**
- **API Key**: Used only for xThreads.app authentication
- **Tweet Content**: Sent to xThreads.app only when you request generation
- **Settings**: Stored locally for your preferences
- **No Tracking**: No analytics or user behavior tracking

### **Permissions**
- **activeTab**: Read tweet content when you click xThreads button
- **scripting**: Inject xThreads button into X.com pages
- **storage**: Save your preferences locally
- **tabs**: Open tweets in background for batch workflow
- **notifications**: Alert about reply opportunities

[Full Privacy Policy](https://xthreads.app/privacy)

## 🚧 Development

### **Project Structure**
```
xthreads-extension/
├── manifest.json          # Extension manifest (MV3)
├── popup.html/css/js       # Main extension popup interface
├── content.js/css          # Content script for X.com integration
├── background.js           # Service worker for background tasks
├── onboarding.html/css/js  # First-time setup flow
├── assets/                 # Icons and static resources
└── build-production.cjs    # Automated build script
```

### **Build Commands**
```bash
# Create production build
npm run build:production
# or
./build-production.sh

# Development
npm run dev

# Linting
npm run lint
```

### **Architecture**
- **Manifest V3**: Modern Chrome extension format
- **Service Worker**: Background processing and API calls
- **Content Scripts**: X.com page integration
- **Local Storage**: Chrome storage API for persistence
- **Message Passing**: Communication between components

### **API Integration**
- **xThreads.app Endpoints**:
  - `/api/generate-tweet` - Create new tweets from prompts
  - `/api/rewrite-content` - Transform existing content (expects `originalContent` parameter)
  - `/api/generate-thread` - Create tweet threads from topics
  - `/api/ai-reply` - Generate contextual replies to existing tweets
  - `/api/api-brandspaces` - Fetch user's brand spaces

- **API Response Formats**:
  - Generate: `{ tweet: string }`
  - Rewrite: `{ rewrittenContent: string }`
  - Thread: `{ thread: string[] }`
  - Reply: `{ tweet: string }`

## 📝 Contributing

We welcome contributions! Please see our development guidelines:

1. **Fork** the repository
2. **Create** a feature branch
3. **Test** thoroughly across browsers
4. **Submit** a pull request

### **Testing Checklist**
- [ ] All core features work correctly
- [ ] API key setup and validation
- [ ] Content generation across all tones
- [ ] Batch opportunity management
- [ ] Cross-browser compatibility (Chrome, Firefox, Edge)
- [ ] Error handling for network issues
- [ ] Privacy compliance

## 🐛 Support

### **Getting Help**
- **Email**: support@xthreads.app
- **Website**: [xthreads.app](https://xthreads.app)
- **Documentation**: [xthreads.app/docs](https://xthreads.app/docs)

### **Common Issues**
- **API Key Not Working**: Verify key is correct in xThreads.app dashboard
- **No Reply Opportunities**: Check keyword settings and ensure auto-monitoring is enabled
- **Extension Not Loading**: Try refreshing X.com page or restarting browser
- **Generation Fails**: Check internet connection and API key validity

### **Feature Requests**
Contact support@xthreads.app with detailed descriptions of desired features.

## 📋 Changelog

### **v1.0.1** - Current Release
- Modern unified chat interface with conversation-style interactions
- AI-powered tweet generation with 15+ tones using `/api/generate-tweet`
- Content rewriting with `/api/rewrite-content` (fixed API parameter: `originalContent`)
- Thread creation with individual tweet cards and copy buttons
- Teal/white themed UI with gradient cards and hover effects
- 24-hour conversation history persistence
- Fixed Chrome Web Store submission issues
- Comprehensive debugging system for troubleshooting
- Character counters with color-coded limits
- AI warning banner for content transparency

### **v1.0.0** - Initial Release  
- Basic tweet generation and rewriting functionality
- Tab-based interface (deprecated in v1.0.1)
- Thread creation capabilities
- Brand space integration
- Chrome Extension Manifest V3 compliance

## 📄 License

This project is proprietary software. All rights reserved.

## 🏷️ Tags

`AI` `Twitter` `X.com` `Social Media` `Content Creation` `Automation` `Productivity` `Chrome Extension` `Firefox Add-on` `Edge Extension`

---

**Made with ❤️ by the xThreads team**

Transform your X.com experience with AI-powered content creation!