// Guard against multiple injections
if (!window.__xthreads_injected__) {
  window.__xthreads_injected__ = true;

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
    this.addOverlayButtons();
    
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
        case 'typeInComposer':
          this.typeInComposer(message.text);
          break;
        case 'postThread':
          this.postThread(message.thread);
          break;
      }
    });
  }

  setupActivityTracking() {
    let activityTimeout;
    
    const updateActivity = () => {
      this.lastActivity = Date.now();
      clearTimeout(activityTimeout);
      
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

    this.activityCheckInterval = setInterval(() => {
      if (this.isActive && this.settings?.mode === 'auto') {
        const isTabFocused = !document.hidden;
        const isRecentActivity = Date.now() - this.lastActivity < 300000;
        
        if (!isTabFocused || !isRecentActivity) {
          this.pauseAutoMode();
        }
      }
    }, 30000);
  }

  async loadRepliedTweets() {
    try {
      const result = await chrome.storage.local.get('xthreads_replied_tweets');
      if (result.xthreads_replied_tweets) {
        const cutoff = Date.now() - (48 * 60 * 60 * 1000);
        const validTweets = result.xthreads_replied_tweets.filter(
          tweet => tweet.timestamp > cutoff
        );
        
        this.repliedTweets = new Set(validTweets.map(t => t.id));
        
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

  addOverlayButtons() {
    this.addButtonsToTweets();
    
    const observer = new MutationObserver((mutations) => {
      let shouldAddButtons = false;
      
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
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
        setTimeout(() => this.addButtonsToTweets(), 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  addButtonsToTweets() {
    const tweets = document.querySelectorAll('[data-testid="tweet"]');
    
    tweets.forEach(tweet => {
      if (tweet.querySelector('.xthreads-overlay-btn')) return;
      
      const tweetId = this.extractTweetId(tweet);
      if (!tweetId) return;

      const actionBar = tweet.querySelector('[role="group"]');
      if (!actionBar) return;

      const overlayBtn = this.createOverlayButton(tweet, tweetId);
      actionBar.appendChild(overlayBtn);
    });
  }

  createOverlayButton(tweetElement, tweetId) {
    const button = document.createElement('button');
    button.className = 'xthreads-overlay-btn';
    button.innerHTML = `
      <img src="${chrome.runtime.getURL('assets/logo16.png')}" width="14" height="14" alt="xThreads" />
    `;
    
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await this.handleOverlayClick(tweetElement, tweetId);
    });

    return button;
  }

  async handleOverlayClick(tweetElement, tweetId) {
    const tweetText = this.extractTweetText(tweetElement);
    
    // Show context menu or directly reply
    const action = await this.showContextMenu(tweetText);
    
    if (action === 'reply') {
      await this.handleReply(tweetElement, tweetId, tweetText);
    } else if (action === 'rewrite') {
      await this.handleRewrite(tweetText);
    }
  }

  async showContextMenu(tweetText) {
    return new Promise((resolve) => {
      const menu = document.createElement('div');
      menu.className = 'xthreads-context-menu';
      menu.innerHTML = `
        <div class="context-menu-item" data-action="reply">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
          Reply to this tweet
        </div>
        <div class="context-menu-item" data-action="rewrite">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Rewrite this tweet
        </div>
      `;
      
      document.body.appendChild(menu);
      
      menu.addEventListener('click', (e) => {
        const action = e.target.closest('.context-menu-item')?.dataset.action;
        menu.remove();
        resolve(action);
      });
      
      // Remove menu after 5 seconds
      setTimeout(() => {
        if (menu.parentNode) {
          menu.remove();
          resolve(null);
        }
      }, 5000);
    });
  }

  async handleReply(tweetElement, tweetId, tweetText) {
    if (!this.settings?.apiKey) {
      this.showToast('Please configure API key in extension popup', 'error');
      return;
    }

    try {
      const reply = await this.generateReply(tweetText, this.settings.tone || 'neutral');
      
      if (reply) {
        await this.postReply(tweetElement, reply, tweetId);
        this.showToast('Reply posted successfully!', 'success');
      }
    } catch (error) {
      console.error('Reply failed:', error);
      this.showToast('Failed to generate reply', 'error');
    }
  }

  async handleRewrite(tweetText) {
    // Open popup with the tweet text pre-filled
    try {
      await chrome.runtime.sendMessage({
        action: 'openPopupWithText',
        text: tweetText,
        tab: 'rewrite'
      });
    } catch (error) {
      console.error('Failed to open popup:', error);
    }
  }

  async typeInComposer(text) {
    try {
      // Find the main tweet composer
      const composer = document.querySelector('[data-testid="tweetTextarea_0"]') ||
                      document.querySelector('[role="textbox"][data-testid="tweetTextarea_0"]') ||
                      document.querySelector('div[role="textbox"][contenteditable="true"]');
      
      if (!composer) {
        // Try to open composer
        const composeBtn = document.querySelector('[data-testid="SideNav_NewTweet_Button"]') ||
                          document.querySelector('[href="/compose/tweet"]');
        
        if (composeBtn) {
          composeBtn.click();
          await this.sleep(2000);
          return this.typeInComposer(text);
        }
        
        throw new Error('Tweet composer not found');
      }
      
      // Clear existing text and type new text
      composer.focus();
      composer.textContent = '';
      
      await this.simulateTyping(composer, text);
      
      // Wait a moment then click post
      await this.sleep(1000);
      
      const postButton = document.querySelector('[data-testid="tweetButtonInline"]') ||
                        document.querySelector('[data-testid="tweetButton"]');
      
      if (postButton && !postButton.disabled) {
        postButton.click();
      }
      
    } catch (error) {
      console.error('Failed to type in composer:', error);
      throw error;
    }
  }

  async postThread(thread) {
    try {
      // Navigate to compose if not already there
      if (!window.location.href.includes('/compose/tweet')) {
        window.location.href = 'https://x.com/compose/tweet';
        await this.sleep(3000);
      }
      
      for (let i = 0; i < thread.length; i++) {
        const tweet = thread[i];
        
        // Find the current tweet composer
        const composer = document.querySelector('[data-testid="tweetTextarea_0"]') ||
                        document.querySelector(`[data-testid="tweetTextarea_${i}"]`) ||
                        document.querySelector('div[role="textbox"][contenteditable="true"]');
        
        if (!composer) {
          throw new Error(`Tweet composer not found for tweet ${i + 1}`);
        }
        
        // Type the tweet
        composer.focus();
        composer.textContent = '';
        await this.simulateTyping(composer, tweet);
        
        // Add next tweet if not the last one
        if (i < thread.length - 1) {
          const addTweetBtn = document.querySelector('[data-testid="addButton"]') ||
                             document.querySelector('[aria-label="Add tweet"]');
          
          if (addTweetBtn) {
            addTweetBtn.click();
            await this.sleep(1000);
          }
        }
      }
      
      // Post the entire thread
      await this.sleep(1000);
      const postAllBtn = document.querySelector('[data-testid="tweetButton"]');
      
      if (postAllBtn && !postAllBtn.disabled) {
        postAllBtn.click();
      }
      
    } catch (error) {
      console.error('Failed to post thread:', error);
      throw error;
    }
  }

  async simulateTyping(element, text) {
    element.focus();
    
    for (let i = 0; i < text.length; i++) {
      element.textContent = text.substring(0, i + 1);
      
      // Trigger input events
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Random typing delay (30-100ms)
      await this.sleep(this.getRandomInterval(30, 100));
    }
    
    // Final events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Wait a bit more to ensure the post button is enabled
    await this.sleep(500);
  }

  startAgent(settings) {
    this.settings = settings;
    this.isActive = true;
    this.failureCount = 0;

    console.log('xThreads Agent started');

    if (settings.mode === 'auto') {
      this.startAutoMode();
    }
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

    this.replyInterval = setInterval(() => {
      if (this.isActive && this.settings?.mode === 'auto') {
        this.processAutoReplies();
      }
    }, this.getRandomInterval(30000, 60000));

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
      const validTweets = tweets.slice(0, 3);

      console.log(`Found ${validTweets.length} matching tweets for auto reply`);

      for (const tweet of validTweets) {
        if (!this.isActive) break;
        
        const tweetId = this.extractTweetId(tweet);
        if (!tweetId || this.repliedTweets.has(tweetId)) continue;

        try {
          const tweetText = this.extractTweetText(tweet);
          const reply = await this.generateReply(tweetText, this.settings.tone);
          
          if (reply) {
            const delay = this.getRandomInterval(5000, 30000);
            await this.sleep(delay);
            
            if (!this.isActive) break;
            
            await this.postReply(tweet, reply, tweetId);
            console.log('Auto reply posted successfully');
            
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
      
      const hasKeyword = keywords.some(keyword => 
        tweetText.includes(keyword)
      );
      
      if (!hasKeyword) return false;
      
      const replyCount = this.getReplyCount(tweet);
      const isRecent = this.isTweetRecent(tweet);
      const isFromVerified = this.isTweetFromVerified(tweet);
      
      return replyCount < 10 && isRecent && !isFromVerified;
    });
  }

  extractTweetId(tweetElement) {
    const link = tweetElement.querySelector('a[href*="/status/"]');
    if (link) {
      const match = link.href.match(/\/status\/(\d+)/);
      return match ? match[1] : null;
    }
    
    const text = this.extractTweetText(tweetElement);
    return text ? this.hashCode(text).toString() : null;
  }

  extractTweetText(tweetElement) {
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
      return diffMinutes < 60;
    }
    return true;
  }

  isTweetFromVerified(tweetElement) {
    const verifiedBadge = tweetElement.querySelector('[data-testid="icon-verified"]');
    return !!verifiedBadge;
  }

  async generateReply(tweetText, tone = 'neutral') {
    try {
      const response = await fetch('https://www.xthreads.app/api/ai-reply', {
        method: 'POST',
        mode: 'cors',
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
    let cleaned = reply
      .replace(/#\w+/g, '')
      .replace(/[^\w\s.,?!]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (cleaned.length > 250) {
      cleaned = cleaned.substring(0, 247) + '...';
    }
    
    if (cleaned.toLowerCase().includes('as an ai') || 
        cleaned.toLowerCase().includes('i am an ai') ||
        cleaned.toLowerCase().includes('artificial intelligence')) {
      throw new Error('Reply appears too robotic');
    }
    
    return cleaned;
  }

  async postReply(tweetElement, replyText, tweetId) {
    try {
      const replyButton = tweetElement.querySelector('[data-testid="reply"]');
      if (!replyButton) {
        throw new Error('Reply button not found');
      }
      
      replyButton.click();
      await this.sleep(1500);
      
      const replyTextArea = document.querySelector('[data-testid="tweetTextarea_0"]') ||
                           document.querySelector('[role="textbox"][data-testid="tweetTextarea_0"]') ||
                           document.querySelector('div[role="textbox"][contenteditable="true"]');
      
      if (!replyTextArea) {
        throw new Error('Reply text area not found');
      }
      
      replyTextArea.focus();
      replyTextArea.textContent = '';
      
      await this.simulateTyping(replyTextArea, replyText);
      await this.sleep(1000);
      
      const postButton = document.querySelector('[data-testid="tweetButtonInline"]') ||
                        document.querySelector('[data-testid="tweetButton"]');
      
      if (postButton && !postButton.disabled) {
        postButton.click();
        await this.sleep(2000);
        await this.saveRepliedTweet(tweetId);
        this.recordReply();
        console.log('Reply posted successfully');
      } else {
        throw new Error('Post button not found or disabled');
      }
      
    } catch (error) {
      console.error('Failed to post reply:', error);
      
      const closeButton = document.querySelector('[data-testid="app-bar-close"]');
      if (closeButton) {
        closeButton.click();
      }
      
      throw error;
    }
  }

  canReply() {
    const now = Date.now();
    
    if (now - this.lastReplyTime < this.minReplyInterval) {
      return false;
    }
    
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
    const oneHourAgo = Date.now() - 3600000;
    this.replyTimes = this.replyTimes.filter(time => time > oneHourAgo);
  }

  handleReplyFailure() {
    this.failureCount++;
    this.updateStats('failure');
  }

  updateStats(type) {
    chrome.runtime.sendMessage({
      action: 'updateStats',
      stats: {
        repliesCount: type === 'success' ? 1 : 0,
        successCount: type === 'success' ? 1 : 0,
        totalAttempts: 1
      }
    });
  }

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
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  showToast(message, type = 'info') {
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

}