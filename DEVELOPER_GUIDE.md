# xThreads Agent - Developer Guide

## 🏗️ Architecture Overview

The xThreads Agent is a Manifest V3 Chrome extension that integrates AI-powered content generation into X.com. It consists of four main components that communicate via Chrome's message passing system.

### **Component Architecture**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Popup UI      │    │  Content Script │    │ Background SW   │
│  (popup.js)     │◄──►│  (content.js)   │◄──►│ (background.js) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Chrome Storage  │    │    X.com DOM    │    │ xThreads.app    │
│   (Local)       │    │   Integration   │    │      API        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📂 File Structure & Responsibilities

### **Core Extension Files**

#### **manifest.json**
- Extension configuration and permissions
- Defines service worker, content scripts, and web accessible resources
- Manifest V3 compliant for modern browsers

#### **popup.js/html/css**
- Main user interface with 4 tabs: Generate, Rewrite, Thread, Agentic Reply
- Settings management and API key configuration
- Batch opportunity management interface
- Message passing to content script and background

#### **content.js/css**
- Injected into X.com pages for DOM manipulation
- Adds xThreads button next to reply buttons
- Monitors for reply opportunities (30-second intervals)
- Extracts tweet data and manages batch processing

#### **background.js** 
- Service worker for persistent background tasks
- API communication with xThreads.app
- Settings and statistics management
- Cross-tab coordination for monitoring

#### **onboarding.js/html/css**
- First-time setup flow
- API key validation and brand space selection
- User education about features

### **Build System Files**

#### **build-production.cjs**
- Automated production build script
- Creates clean ZIP for browser store submission
- Validates manifest and required files
- Generates build information

#### **build-production.sh**
- Shell script alternative for Unix systems
- Same functionality as Node.js version
- Color-coded output and error handling

## 🔄 Message Passing Architecture

### **Popup ↔ Background Communication**
```javascript
// Popup → Background
chrome.runtime.sendMessage({
  action: 'saveSettings',
  settings: settingsObject
});

// Background Response
{ success: true, data: result }
```

### **Content ↔ Background Communication**
```javascript
// Content → Background  
chrome.runtime.sendMessage({
  action: 'showBatchNotification',
  count: opportunityCount,
  opportunities: opportunitiesArray
});
```

### **Popup ↔ Content Communication**
```javascript
// Popup → Content (via tabs.sendMessage)
chrome.tabs.sendMessage(tabId, {
  action: 'startAgent',
  settings: settingsObject
});
```

## 💾 Data Storage Schema

### **Chrome Storage Structure**
```javascript
{
  // User settings and configuration
  xthreads_settings: {
    apiKey: string,
    selectedBrandId: string,
    keywords: string[],
    tone: string,
    isActive: boolean,
    isOnboarded: boolean
  },
  
  // Usage statistics
  xthreads_stats: {
    repliesCount: number,
    successCount: number,
    totalAttempts: number
  },
  
  // Reply history (24-hour sliding window)
  xthreads_replied_tweets: [
    { id: string, timestamp: number }
  ],
  
  // Batch opportunities (1-hour sliding window)
  xthreads_batch_opportunities: [
    {
      id: string,
      content: string,
      url: string,
      reply: string,
      timestamp: number,
      foundAt: number
    }
  ],
  
  // Current tweet context (30-second TTL)
  xthreads_current_tweet: {
    id: string,
    content: string,
    url: string,
    timestamp: number
  }
}
```

## 🌐 API Integration

### **xThreads.app Endpoints**

#### **Authentication**
```javascript
headers: {
  'Content-Type': 'application/json',
  'x-api-key': userApiKey
}
```

#### **Generate Tweet**
```javascript
POST /api/generate-tweet
{
  prompt: string,
  brandId: string,
  tone: string
}
Response: { tweet: string }
```

#### **AI Reply Generation**
```javascript
POST /api/ai-reply
{
  parentTweetContent: string,
  brandId: string,
  tone: string
}
Response: { reply: string }
```

#### **Content Rewriting**
```javascript
POST /api/rewrite-content
{
  originalContent: string,
  brandId: string,
  tone: string
}
Response: { rewrittenContent: string }
```

#### **Thread Generation**
```javascript
POST /api/generate-thread
{
  prompt: string,
  brandId: string,
  tone: string
}
Response: { thread: string[] }
```

#### **Brand Spaces**
```javascript
GET /api/api-brandspaces
Response: [{ _id: string, name: string }]
```

## 🔍 Content Script Integration

### **Tweet Detection & Button Injection**
```javascript
// Find tweets and inject xThreads buttons
addTweetButtons() {
  const tweets = document.querySelectorAll('[data-testid="tweet"]:not(.xthreads-enhanced)');
  
  tweets.forEach(tweet => {
    const replyButton = tweet.querySelector('[data-testid="reply"]');
    const tweetData = this.extractTweetData(tweet);
    this.injectTweetButton(actionsToolbar, replyButton, tweetData);
  });
}
```

### **Automated Monitoring System**
```javascript
// 30-second scanning for opportunities
performBatchScan() {
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  
  for (const tweet of tweets) {
    const tweetData = this.extractTweetData(tweet);
    if (this.shouldReplyToTweet(tweetData, this.settings)) {
      // Generate and store opportunity
    }
  }
}
```

### **Tweet Data Extraction**
```javascript
extractTweetData(tweetElement) {
  const textElement = tweetElement.querySelector('[data-testid="tweetText"]');
  const linkElement = tweetElement.querySelector('a[href*="/status/"]');
  const timeElement = tweetElement.querySelector('time');
  
  return {
    id: extractTweetId(linkElement.href),
    content: textElement.textContent.trim(),
    url: linkElement.href,
    timestamp: new Date(timeElement.dateTime).getTime()
  };
}
```

## 🎯 Opportunity Detection Logic

### **Keyword-Based Detection**
```javascript
shouldReplyToTweet(tweetData, settings) {
  const content = tweetData.content.toLowerCase();
  const keywords = settings.keywords || [];
  
  // Primary: Keyword matching
  if (keywords.length > 0) {
    return keywords.some(keyword => 
      content.includes(keyword.toLowerCase())
    );
  }
  
  // Fallback: Pattern-based detection
  return this.isGoodReplyOpportunity(tweetData, content);
}
```

### **Pattern-Based Fallback**
```javascript
isGoodReplyOpportunity(tweetData, content) {
  const engagementPatterns = [
    /\?$/, // Questions
    /what.*think/i,
    /anyone.*know/i,
    /startup/i,
    /entrepreneur/i,
    // ... more patterns
  ];
  
  return engagementPatterns.some(pattern => pattern.test(content));
}
```

## 🔧 Development Workflow

### **Local Development Setup**
```bash
# Clone repository
git clone [repository-url]
cd xthreads-extension

# Install dependencies
npm install

# Load extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select project directory
```

### **Testing Workflow**
```bash
# Run linting
npm run lint

# Create production build
npm run build:production

# Test in multiple browsers
# - Chrome: chrome://extensions/
# - Firefox: about:debugging#/runtime/this-firefox
# - Edge: edge://extensions/
```

### **Release Process**
```bash
# 1. Update version in manifest.json
# 2. Test all functionality
# 3. Create production build
npm run build:production

# 4. Upload to browser stores
# - Chrome Web Store: production-build/xthreads-agent-v*.zip
# - Firefox Add-ons: Same ZIP file
# - Edge Add-ons: Same ZIP file
```

## 🛡️ Security Considerations

### **Content Security Policy**
- No eval() or dangerous function usage
- All external scripts loaded via manifest
- innerHTML usage limited to escaped content

### **Permission Justification**
- **activeTab**: Read tweet content only when user clicks xThreads button
- **scripting**: Inject xThreads button into X.com pages
- **storage**: Save user preferences locally
- **tabs**: Background tab management for batch workflow
- **notifications**: Alert about reply opportunities

### **API Security**
- API key stored in Chrome storage (encrypted)
- HTTPS-only communication with xThreads.app
- No API key logging or exposure
- Rate limiting and error handling

## 🐛 Common Development Issues

### **Content Script Not Loading**
```javascript
// Ensure proper injection timing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
```

### **Message Passing Failures**
```javascript
// Always include error handling
chrome.runtime.sendMessage(message, (response) => {
  if (chrome.runtime.lastError) {
    console.error('Message failed:', chrome.runtime.lastError);
    return;
  }
  // Handle response
});
```

### **Storage Race Conditions**
```javascript
// Use proper async/await patterns
async function updateSettings(newSettings) {
  try {
    await chrome.storage.local.set({
      xthreads_settings: newSettings
    });
  } catch (error) {
    console.error('Storage failed:', error);
  }
}
```

## 📊 Performance Monitoring

### **Key Metrics to Track**
- Extension load time
- API response times
- Memory usage during scanning
- Battery impact on mobile devices

### **Optimization Strategies**
- Debounced DOM observations
- Efficient tweet data extraction
- Smart batching of API calls
- Cleanup of old data (sliding windows)

## 🔄 Future Architecture Considerations

### **Scalability**
- Modular component architecture for feature additions
- Plugin system for custom tone implementations
- Webhooks for real-time opportunity notifications

### **Cross-Platform**
- Shared core logic between browser extensions
- Mobile app integration possibilities
- Desktop application considerations

This developer guide provides the foundation for understanding, maintaining, and extending the xThreads Agent extension.