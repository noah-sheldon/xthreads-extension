# xThreads Agent - Browser Extension

![xThreads Agent](assets/icon48.png)

**AI-powered content creation and automated reply generation for X.com using xThreads.app API**

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-blue?style=flat&logo=google-chrome)](https://chrome.google.com/webstore/)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Add--ons-orange?style=flat&logo=firefox)](https://addons.mozilla.org/)
[![Edge Add-ons](https://img.shields.io/badge/Edge-Add--ons-blue?style=flat&logo=microsoft-edge)](https://microsoftedge.microsoft.com/addons/)

## 🚀 Features

### **Smart Content Generation**
- **AI Tweet Generation**: Create engaging tweets from simple prompts
- **Content Rewriting**: Transform existing content with different tones
- **Thread Creation**: Generate multi-tweet threads automatically
- **15+ Tone Options**: Professional, casual, witty, educational, and more

### **Agentic Reply System**
- **One-Time Page Scan**: Finds exactly 10 opportunities on current page then stops automatically
- **Deep Auto-Scroll**: Scrolls down 10 times to load more tweets for comprehensive discovery
- **Relaxed Targeting**: Targets tweets with 1-50 likes and <25 replies for better opportunity finding
- **Persistent Storage**: Opportunities stored indefinitely until manually cleared or new scan

### **Professional Workflow**
- **Copy-to-Clipboard**: Reliable workflow that works with any X.com interface
- **Brand Management**: Multiple brand space support via xThreads.app
- **Usage Tracking**: Monitor your daily reply statistics
- **Persistent Storage**: All data stored securely in your browser

### **Enhanced UX**
- **Seamless Integration**: xThreads button appears next to X.com reply buttons
- **Popup Stays Open**: Work through multiple opportunities without interruption
- **Background Tabs**: Open tweets without losing your place
- **Smart Notifications**: Get alerts about new opportunities

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
2. Go to "Generate" tab
3. Enter your prompt (e.g., "Write about building in public")
4. Select tone and click "Generate Tweet"
5. Copy the generated content to X.com

### **Content Rewriting**
1. Click the xThreads extension icon
2. Go to "Rewrite" tab  
3. Paste existing content
4. Choose new tone and click "Rewrite"
5. Copy the improved version

### **Thread Creation**
1. Click the xThreads extension icon
2. Go to "Thread" tab
3. Enter long-form content
4. Click "Generate Thread"
5. Copy individual tweets or entire thread

### **Manual Reply Generation**
1. Find a tweet you want to reply to on X.com
2. Click the xThreads button (next to reply button)
3. Extension popup opens with AI-generated reply
4. Copy and paste the reply into X.com

### **Agentic Reply System**
1. Click "Start Agent" in "Agentic Reply" tab
2. Set your target keywords for content discovery
3. Agent performs deep auto-scroll scan on current page (10 scrolls)
4. Agent finds up to 10 opportunities matching your keywords/engagement criteria and stops
5. Review stored opportunities and manually select which replies to post
6. Opportunities remain available until you manually clear or start a new scan

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
  - `/api/ai-reply` - Generate contextual replies
  - `/api/generate-tweet` - Create new tweets
  - `/api/rewrite-content` - Transform existing content
  - `/api/generate-thread` - Create tweet threads
  - `/api/api-brandspaces` - Fetch brand spaces

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

### **v1.0.0** - Initial Release
- AI-powered tweet generation with 15+ tones
- Content rewriting and thread creation
- Agentic reply system with automated monitoring
- Batch opportunity management
- Copy-to-clipboard workflow
- Brand space integration
- Cross-browser support (Chrome, Firefox, Edge)

## 📄 License

This project is proprietary software. All rights reserved.

## 🏷️ Tags

`AI` `Twitter` `X.com` `Social Media` `Content Creation` `Automation` `Productivity` `Chrome Extension` `Firefox Add-on` `Edge Extension`

---

**Made with ❤️ by the xThreads team**

Transform your X.com experience with AI-powered content creation!