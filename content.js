class XThreadsAgent {
  constructor() {
    this.settings = null;
    this.isActive = false;
    this.repliedTweets = new Set();
    this.lastActivity = Date.now();
    this.failureCount = 0;
    this.maxFailures = 3;
    this.replyInterval = null;
    this.activityCheckInterval = null;
    
    // Rate limiting
    this.lastReplyTime = 0;
    this.minReplyInterval = 20000; // 20 seconds minimum between replies
    this.maxRepliesPerHour = 60;
    this.replyTimes = [];

    this.init();
  }

  init() {
    this.loadRepliedTweets();
    this.setupActivityTracking();
    this.setupMessageListener();
    this.addManualReplyButtons();
    
    // Clean up old reply times every hour
    setInterval(() => this.cleanupReplyTimes(), 3600000);
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'startAgent':
          this.startAgent(message.settings);
          break;
        case 'stopAgent':
          this.stopAgent();
          break;
      }
    });
  }

  setupActivityTracking() {
    // Track mouse movement and keyboard activity
    let activityTimeout;
    
    const updateActivity = () => {
      this.lastActivity = Date.now();
      clearTimeout(activityTimeout);
      
      // Consider user inactive after 5 minutes of no activity
      activityTimeout = setTimeout(() => {
        if (this.isActive && this.settings?.mode === 'auto') {
          console.log('User inactive, pausing auto replies');
          this.pauseAutoMode();
        }
      }, 300000); // 5 minutes
    };

    document.addEventListener('mousemove', updateActivity);
    document.addEventListener('keydown', updateActivity);
    document.addEventListener('scroll', updateActivity);
    document.addEventListener('click', updateActivity);

    // Check if tab is focused
    this.activityCheckInterval = setInterval(() => {
      if (this.isActive && this.settings?.mode === 'auto') {
        const isTabFocused = !document.hidden;
        const isRecentActivity = Date.now() - this.lastActivity < 300000; // 5 minutes
        
        if (!isTabFocused || !isRecentActivity) {
          this.pauseAutoMode();
        }
      }
    }, 30000); // Check every 30 seconds
  }

  async loadRepliedTweets() {
    try {
      const result = await chrome.storage.local.get('xthreads_replied_tweets');
      if (result.xthreads_replied_tweets) {
        // Clean up tweets older than 48 hours
        const cutoff = Date.now() - (48 * 60 * 60 * 1000);
        const validTweets = result.xthreads_replied_tweets.filter(
          tweet => tweet.timestamp > cutoff
        );
        
        this.repliedTweets = new Set(validTweets.map(t => t.id));
        
        // Save cleaned up list
        await chrome.storage.local.set({
          xthreads_replied_tweets: validTweets
        });
      }
    } catch (error) {
      console.error('Failed to load replied tweets:', error);
    }
  }

  async saveRepliedTweet(tweetId) {
    try {
      const result = await chrome.storage.local.get('xthreads_replied_tweets');
      const repliedTweets = result.xthreads_replied_tweets || [];
      
      repliedTweets.push({
        id: tweetId,
        timestamp: Date.now()
      });
      
      await chrome.storage.local.set({
        xthreads_replied_tweets: repliedTweets
      });
      
      this.repliedTweets.add(tweetId);
    } catch (error) {
      console.error('Failed to save replied tweet:', error);
    }
  }

  addManualReplyButtons() {
    // Add reply buttons to existing tweets
    this.addReplyButtonsToTweets();
    
    // Watch for new tweets being loaded
    const observer = new MutationObserver((mutations) => {
      let shouldAddButtons = false;
      
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if new tweets were added
            if (node.querySelector && (
              node.querySelector('[data-testid="tweet"]') ||
              node.matches('[data-testid="tweet"]')
            )) {
              shouldAddButtons = true;
            }
          }
        });
      });
      
      if (shouldAddButtons) {
        setTimeout(() => this.addReplyButtonsToTweets(), 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  addReplyButtonsToTweets() {
    const tweets = document.querySelectorAll('[data-testid="tweet"]');
    
    tweets.forEach(tweet => {
      // Skip if button already exists
      if (tweet.querySelector('.xthreads-reply-btn')) return;
      
      const tweetId = this.extractTweetId(tweet);
      if (!tweetId) return;

      // Skip if already replied
      if (this.repliedTweets.has(tweetId)) return;

      const actionBar = tweet.querySelector('[role="group"]');
      if (!actionBar) return;

      const replyBtn = this.createReplyButton(tweet, tweetId);
      actionBar.appendChild(replyBtn);
    });
  }

  createReplyButton(tweetElement, tweetId) {
    const button = document.createElement('button');
    button.className = 'xthreads-reply-btn';
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
        <path d="M2 17L12 22L22 17"/>
        <path d="M2 12L12 17L22 12"/>
      </svg>
      <span>xThreads</span>
    `;
    
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await this.handleManualReply(tweetElement, tweetId, button);
    });

    return button;
  }

  async handleManualReply(tweetElement, tweetId, button) {
    if (!this.settings?.apiKey) {
      this.showToast('Please configure API key in extension popup', 'error');
      return;
    }

    const originalText = button.innerHTML;
    button.innerHTML = `
      <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1"/>
        <path d="M16 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1"/>
        <path d="M11 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1"/>
      </svg>
      <span>Generating...</span>
    `;
    button.disabled = true;

    try {
      const tweetText = this.extractTweetText(tweetElement);
      const reply = await this.generateReply(tweetText, this.settings.tone);
      
      if (reply) {
        await this.postReply(tweetElement, reply, tweetId);
        button.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          <span>Replied</span>
        `;
        button.classList.add('replied');
        this.showToast('Reply posted successfully!', 'success');
      } else {
        throw new Error('Failed to generate reply');
      }
    } catch (error) {
      console.error('Manual reply failed:', error);
      button.innerHTML = originalText;
      button.disabled = false;
      this.showToast('Failed to generate reply', 'error');
    }
  }

  startAgent(settings) {
    this.settings = settings;
    this.isActive = true;
    this.failureCount = 0;

    console.log('xThreads Agent started in', settings.mode, 'mode');

    if (settings.mode === 'auto') {
      this.startAutoMode();
    }

    // Update manual buttons with current settings
    this.addReplyButtonsToTweets();
  }

  stopAgent() {
    this.isActive = false;
    
    if (this.replyInterval) {
      clearInterval(this.replyInterval);
      this.replyInterval = null;
    }

    console.log('xThreads Agent stopped');
  }

  startAutoMode() {
    if (this.replyInterval) {
      clearInterval(this.replyInterval);
    }

    // Start auto-reply process - check every 30-60 seconds
    this.replyInterval = setInterval(() => {
      if (this.isActive && this.settings?.mode === 'auto') {
        this.processAutoReplies();
      }
    }, this.getRandomInterval(30000, 60000)); // 30-60 seconds

    // Process immediately
    setTimeout(() => {
      if (this.isActive) {
        this.processAutoReplies();
      }
    }, 2000);
  }

  pauseAutoMode() {
    if (this.replyInterval) {
      clearInterval(this.replyInterval);
      this.replyInterval = null;
    }
    console.log('Auto mode paused due to inactivity');
  }

  async processAutoReplies() {
    if (!this.canReply()) {
      console.log('Rate limit reached, skipping auto replies');
      return;
    }

    try {
      const tweets = this.findMatchingTweets();
      const validTweets = tweets.slice(0, 3); // Process max 3 tweets at a time

      console.log(`Found ${validTweets.length} matching tweets for auto reply`);

      for (const tweet of validTweets) {
        if (!this.isActive) break;
        
        const tweetId = this.extractTweetId(tweet);
        if (!tweetId || this.repliedTweets.has(tweetId)) continue;

        try {
          const tweetText = this.extractTweetText(tweet);
          const reply = await this.generateReply(tweetText, this.settings.tone);
          
          if (reply) {
            // Random delay between replies (5-30 seconds)
            const delay = this.getRandomInterval(5000, 30000);
            await this.sleep(delay);
            
            if (!this.isActive) break;
            
            await this.postReply(tweet, reply, tweetId);
            console.log('Auto reply posted successfully');
            
            // Update stats
            this.updateStats('success');
          }
        } catch (error) {
          console.error('Auto reply failed:', error);
          this.handleReplyFailure();
          
          if (this.failureCount >= this.maxFailures) {
            this.pauseAutoMode();
            this.showToast('Too many failures, auto mode paused', 'error');
            break;
          }
        }
      }
    } catch (error) {
      console.error('Error processing auto replies:', error);
    }
  }

  findMatchingTweets() {
    const tweets = Array.from(document.querySelectorAll('[data-testid="tweet"]'));
    const keywords = this.settings.keywords.map(k => k.toLowerCase());
    
    return tweets.filter(tweet => {
      const tweetId = this.extractTweetId(tweet);
      if (!tweetId || this.repliedTweets.has(tweetId)) return false;
      
      const tweetText = this.extractTweetText(tweet).toLowerCase();
      
      // Check if tweet contains any keywords
      const hasKeyword = keywords.some(keyword => 
        tweetText.includes(keyword)
      );
      
      if (!hasKeyword) return false;
      
      // Prioritize recent tweets with low reply counts
      const replyCount = this.getReplyCount(tweet);
      const isRecent = this.isTweetRecent(tweet);
      const isFromVerified = this.isTweetFromVerified(tweet);
      
      // Skip tweets with too many replies or from verified accounts
      return replyCount < 10 && isRecent && !isFromVerified;
    });
  }

  extractTweetId(tweetElement) {
    // Try to extract tweet ID from various possible locations
    const link = tweetElement.querySelector('a[href*="/status/"]');
    if (link) {
      const match = link.href.match(/\/status\/(\d+)/);
      return match ? match[1] : null;
    }
    
    // Fallback: use element's position and text hash
    const text = this.extractTweetText(tweetElement);
    return text ? this.hashCode(text).toString() : null;
  }

  extractTweetText(tweetElement) {
    // Try multiple selectors to find tweet text
    const textSelectors = [
      '[data-testid="tweetText"]',
      '[lang]',
      '.css-901oao.css-16my406.r-poiln3.r-bcqeeo.r-qvutc0'
    ];
    
    for (const selector of textSelectors) {
      const textElement = tweetElement.querySelector(selector);
      if (textElement) {
        return textElement.textContent.trim();
      }
    }
    
    // Fallback: get all text content and clean it
    const allText = tweetElement.textContent || '';
    return allText.replace(/\s+/g, ' ').trim().substring(0, 500);
  }

  getReplyCount(tweetElement) {
    const replyButton = tweetElement.querySelector('[data-testid="reply"]');
    if (replyButton) {
      const countElement = replyButton.querySelector('[data-testid="app-text-transition-container"]');
      if (countElement) {
        const count = parseInt(countElement.textContent) || 0;
        return count;
      }
    }
    return 0;
  }

  isTweetRecent(tweetElement) {
    const timeElement = tweetElement.querySelector('time');
    if (timeElement) {
      const tweetTime = new Date(timeElement.dateTime);
      const now = new Date();
      const diffMinutes = (now - tweetTime) / (1000 * 60);
      return diffMinutes < 60; // Tweet is less than 1 hour old
    }
    return true; // Assume recent if we can't determine
  }

  isTweetFromVerified(tweetElement) {
    // Look for verification badge
    const verifiedBadge = tweetElement.querySelector('[data-testid="icon-verified"]');
    return !!verifiedBadge;
  }

  async generateReply(tweetText, tone = 'neutral') {
    try {
      const response = await fetch('https://xthreads.app/api/ai-reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.settings.apiKey
        },
        body: JSON.stringify({
          tweet: tweetText,
          tone: tone
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.reply) {
        // Clean and validate reply
        return this.cleanReply(data.reply);
      } else {
        throw new Error('No reply generated');
      }
    } catch (error) {
      console.error('Failed to generate reply:', error);
      throw error;
    }
  }

  cleanReply(reply) {
    // Remove hashtags, excessive emojis, and ensure human-like text
    let cleaned = reply
      .replace(/#\w+/g, '') // Remove hashtags
      .replace(/[^\w\s.,?!]/g, '') // Keep only allowed special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Ensure reasonable length (Twitter's limit is 280 chars)
    if (cleaned.length > 250) {
      cleaned = cleaned.substring(0, 247) + '...';
    }
    
    // Ensure it doesn't look robotic
    if (cleaned.toLowerCase().includes('as an ai') || 
        cleaned.toLowerCase().includes('i am an ai') ||
        cleaned.toLowerCase().includes('artificial intelligence')) {
      throw new Error('Reply appears too robotic');
    }
    
    return cleaned;
  }

  async postReply(tweetElement, replyText, tweetId) {
    try {
      // Click the reply button to open reply dialog
      const replyButton = tweetElement.querySelector('[data-testid="reply"]');
      if (!replyButton) {
        throw new Error('Reply button not found');
      }
      
      replyButton.click();
      
      // Wait for reply dialog to open
      await this.sleep(1500);
      
      // Find the reply text area
      const replyTextArea = document.querySelector('[data-testid="tweetTextarea_0"]') ||
                           document.querySelector('[role="textbox"][data-testid="tweetTextarea_0"]') ||
                           document.querySelector('div[role="textbox"][contenteditable="true"]');
      
      if (!replyTextArea) {
        throw new Error('Reply text area not found');
      }
      
      // Clear existing text and insert reply
      replyTextArea.focus();
      replyTextArea.textContent = '';
      
      // Simulate typing
      await this.simulateTyping(replyTextArea, replyText);
      
      // Wait a moment before posting
      await this.sleep(1000);
      
      // Find and click the reply/post button
      const postButton = document.querySelector('[data-testid="tweetButtonInline"]') ||
                        document.querySelector('[data-testid="tweetButton"]');
      
      if (postButton && !postButton.disabled) {
        postButton.click();
        
        // Wait for post to complete
        await this.sleep(2000);
        
        // Mark as replied
        await this.saveRepliedTweet(tweetId);
        
        // Record successful reply
        this.recordReply();
        
        console.log('Reply posted successfully');
      } else {
        throw new Error('Post button not found or disabled');
      }
      
    } catch (error) {
      console.error('Failed to post reply:', error);
      
      // Try to close any open dialogs
      const closeButton = document.querySelector('[data-testid="app-bar-close"]');
      if (closeButton) {
        closeButton.click();
      }
      
      throw error;
    }
  }

  async simulateTyping(element, text) {
    // Simulate human-like typing
    element.focus();
    
    for (let i = 0; i < text.length; i++) {
      element.textContent = text.substring(0, i + 1);
      
      // Trigger input events
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Random typing delay (50-150ms)
      await this.sleep(this.getRandomInterval(50, 150));
    }
    
    // Final events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  canReply() {
    const now = Date.now();
    
    // Check minimum interval between replies
    if (now - this.lastReplyTime < this.minReplyInterval) {
      return false;
    }
    
    // Check hourly rate limit
    this.cleanupReplyTimes();
    return this.replyTimes.length < this.maxRepliesPerHour;
  }

  recordReply() {
    const now = Date.now();
    this.lastReplyTime = now;
    this.replyTimes.push(now);
    this.cleanupReplyTimes();
  }

  cleanupReplyTimes() {
    const oneHourAgo = Date.now() - 3600000; // 1 hour
    this.replyTimes = this.replyTimes.filter(time => time > oneHourAgo);
  }

  handleReplyFailure() {
    this.failureCount++;
    this.updateStats('failure');
  }

  updateStats(type) {
    // Send stats update to popup
    chrome.runtime.sendMessage({
      action: 'updateStats',
      stats: {
        repliesCount: type === 'success' ? 1 : 0,
        successCount: type === 'success' ? 1 : 0,
        totalAttempts: 1
      }
    });
  }

  // Utility functions
  getRandomInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  showToast(message, type = 'info') {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = `xthreads-toast xthreads-toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 4000);
  }
}

// Initialize agent when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new XThreadsAgent();
  });
} else {
  new XThreadsAgent();
}