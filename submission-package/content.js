// Guard against multiple injections
if (!window.__xthreads_injected__) {
  window.__xthreads_injected__ = true;
  
  // Inject CSS for xThreads tweet buttons
  const style = document.createElement('style');
  style.textContent = `
    .xthreads-tweet-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    
    .xthreads-tweet-button [role="button"]:hover {
      background-color: rgba(0, 188, 212, 0.1) !important;
    }
    
    .xthreads-tweet-button img {
      filter: brightness(0) saturate(100%) invert(39%) sepia(21%) saturate(200%) hue-rotate(180deg) brightness(96%) contrast(97%);
      transition: all 0.2s ease;
    }
    
    .xthreads-tweet-button [role="button"]:hover img {
      filter: brightness(0) saturate(100%) invert(71%) sepia(89%) saturate(1481%) hue-rotate(166deg) brightness(91%) contrast(101%);
    }
  `;
  document.head.appendChild(style);


  class XThreadsContentScript {
    constructor() {
      this.settings = null;
      this.isActive = false;
      this.repliedTweets = new Set();
      this.currentModal = null;
      this.scanInterval = null;
      this.batchOpportunities = [];
      this.lastScanTime = 0;
      this.lastNotificationTime = 0;
      
      this.init();
    }

    init() {
      console.log('xThreads Content Script initialized');
      this.setupMessageListener();
      this.loadRepliedTweets();
      
      // Wait for initial page load then start checking for tweet buttons
      setTimeout(() => {
        this.addTweetButtons();
        this.setupDOMObserver();
        this.checkMonitoringStatus();
      }, 2000);
      
      // Also check again after a longer delay for SPA navigation
      setTimeout(() => {
        this.addTweetButtons();
      }, 5000);

      // Listen for tab visibility changes
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.checkMonitoringStatus();
        }
      });
    }

    async checkMonitoringStatus() {
      try {
        // Check if monitoring should be active
        const result = await chrome.storage.local.get('xthreads_settings');
        const settings = result.xthreads_settings;
        
        if (settings && settings.isActive && settings.apiKey) {
          console.log('Resuming auto-monitoring on tab focus');
          this.startAgent(settings);
        }
      } catch (error) {
        console.log('Could not check monitoring status:', error);
      }
    }

    setupMessageListener() {
      chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
        switch (message.action) {
          case 'startAgent':
            this.startAgent(message.settings);
            sendResponse({ success: true });
            break;

          case 'stopAgent':
            this.stopAgent();
            sendResponse({ success: true });
            break;

          case 'openReplyTab':
            this.openReplyTab(message.tweetData);
            sendResponse({ success: true });
            break;

          case 'scanForAgenticReplies':
            this.scanForAgenticReplies(message.settings);
            sendResponse({ success: true });
            break;

          case 'showAgenticReplyNotification':
            this.showAgenticReplyNotification(message.tweetData, message.reply);
            sendResponse({ success: true });
            break;
        }
      });
    }

    setupDOMObserver() {
      const observer = new MutationObserver((mutations) => {
        let shouldCheckTweets = false;
        
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check for new tweets
              if (node.querySelector?.('[data-testid="tweet"]') || 
                  node.matches?.('[data-testid="tweet"]')) {
                shouldCheckTweets = true;
              }
              
              // Check for tweet actions (reply buttons)
              if (node.querySelector?.('[data-testid="reply"]') || 
                  node.matches?.('[data-testid="reply"]')) {
                shouldCheckTweets = true;
              }
            }
          });
        });
        
        if (shouldCheckTweets) {
          console.log('DOM changed, checking for tweets...');
          setTimeout(() => this.addTweetButtons(), 100);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false // Reduce observer overhead
      });
      
      // Also run periodically as a fallback
      setInterval(() => {
        this.addTweetButtons();
      }, 5000);
    }

    addTweetButtons() {
      console.log('Looking for tweets to add buttons...');
      
      // Find all tweets that don't already have xThreads buttons
      const tweets = document.querySelectorAll('[data-testid="tweet"]:not(.xthreads-enhanced)');
      console.log(`Found ${tweets.length} new tweets`);
      
      tweets.forEach((tweet) => {
        // Find the reply button container
        const replyButton = tweet.querySelector('[data-testid="reply"]');
        if (!replyButton) return;
        
        // Get the actions toolbar (parent of reply button)
        const actionsToolbar = replyButton.closest('[role="group"]');
        if (!actionsToolbar) return;
        
        // Mark as enhanced
        tweet.classList.add('xthreads-enhanced');
        
        // Extract tweet data
        const tweetData = this.extractTweetData(tweet);
        if (!tweetData) return;
        
        // Inject xThreads button next to reply
        this.injectTweetButton(actionsToolbar, replyButton, tweetData);
      });
    }

    injectTweetButton(actionsToolbar, replyButton, tweetData) {
      // Check if button already exists
      if (actionsToolbar.querySelector('.xthreads-tweet-button')) return;
      
      const button = document.createElement('div');
      button.className = 'xthreads-tweet-button';
      button.innerHTML = `
        <div role="button" tabindex="0" style="
          min-height: 32px;
          min-width: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          transition: background-color 0.2s;
          cursor: pointer;
          margin: 0 4px;
        " title="Generate Reply with xThreads">
          <img src="${chrome.runtime.getURL('assets/icon16.png')}" 
               width="18" 
               height="18" 
               style="opacity: 0.6; transition: opacity 0.2s;" />
        </div>
      `;
      
      const buttonElement = button.querySelector('[role="button"]');
      
      // Hover effects
      buttonElement.addEventListener('mouseenter', () => {
        buttonElement.style.backgroundColor = 'rgba(0, 188, 212, 0.1)';
        buttonElement.querySelector('img').style.opacity = '1';
      });
      
      buttonElement.addEventListener('mouseleave', () => {
        buttonElement.style.backgroundColor = 'transparent';
        buttonElement.querySelector('img').style.opacity = '0.6';
      });
      
      // Click handler
      buttonElement.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openReplyWithTweetData(tweetData);
      });

      // Insert after reply button
      const replyContainer = replyButton.parentElement;
      replyContainer.parentNode.insertBefore(button, replyContainer.nextSibling);
    }

    openReplyWithTweetData(tweetData) {
      // Store tweet data for popup to access
      chrome.storage.local.set({
        xthreads_current_tweet: {
          ...tweetData,
          timestamp: Date.now()
        }
      });
      
      // Show visual indicator since we can't reliably open popup programmatically
      this.showOpenPopupIndicator();
      
      // Also try background script approach as fallback
      chrome.runtime.sendMessage({
        action: 'openPopupToReplyTab',
        tweetData: tweetData
      });
    }

    openReplyTab(tweetData) {
      // This method is called from popup.js message
      this.openReplyWithTweetData(tweetData);
    }




    // Agentic Reply Functions
    startAgent(settings) {
      this.settings = settings;
      this.isActive = true;
      
      // Start 30-second scanning interval
      if (this.scanInterval) {
        clearInterval(this.scanInterval);
      }
      
      this.scanInterval = setInterval(() => {
        this.performBatchScan();
      }, 30000); // 30 seconds
      
      console.log('xThreads Agent started with 30-second scanning');
      
      // Perform initial scan
      setTimeout(() => this.performBatchScan(), 2000);
    }

    stopAgent() {
      this.isActive = false;
      
      // Clear scanning interval
      if (this.scanInterval) {
        clearInterval(this.scanInterval);
        this.scanInterval = null;
      }
      
      console.log('xThreads Agent stopped');
    }

    async performBatchScan() {
      if (!this.isActive || !this.settings) return;

      try {
        console.log('Performing batch scan for opportunities...');
        
        // Find tweets on current page
        const tweets = document.querySelectorAll('[data-testid="tweet"]');
        const newOpportunities = [];
        
        for (const tweet of tweets) {
          const tweetData = this.extractTweetData(tweet);
          
          if (tweetData && this.shouldReplyToTweet(tweetData, this.settings)) {
            // Check if we already have this opportunity
            const exists = this.batchOpportunities.some(op => op.id === tweetData.id);
            if (!exists) {
              // Generate reply for this opportunity
              const reply = await this.generateReplyForTweet(tweetData);
              if (reply) {
                const opportunity = {
                  ...tweetData,
                  reply: reply,
                  foundAt: Date.now()
                };
                
                newOpportunities.push(opportunity);
                this.batchOpportunities.push(opportunity);
              }
            }
          }
        }
        
        // If we found new opportunities, store them and check for batch notification
        if (newOpportunities.length > 0) {
          console.log(`Found ${newOpportunities.length} new opportunities`);
          await this.storeBatchOpportunities();
          
          // Check if we should notify (batch of 3+ or 2 minutes since last notification)
          const shouldNotify = this.shouldSendBatchNotification();
          if (shouldNotify) {
            this.sendBatchNotification();
          }
        }
        
        // Clean up old opportunities (older than 1 hour)
        this.cleanupOldOpportunities();
        
      } catch (error) {
        console.error('Failed to perform batch scan:', error);
      }
    }

    async scanForAgenticReplies(settings) {
      // This method is called from popup for manual refresh
      this.settings = settings;
      await this.performBatchScan();
    }

    async generateReplyForTweet(tweetData) {
      if (!this.settings?.apiKey || !this.settings?.selectedBrandId) {
        console.log('Missing API key or brand ID for reply generation');
        return null;
      }

      try {
        const response = await fetch('https://www.xthreads.app/api/ai-reply', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.settings.apiKey
          },
          body: JSON.stringify({
            parentTweetContent: tweetData.content,
            brandId: this.settings.selectedBrandId,
            tone: this.settings.tone || 'professional'
          })
        });

        if (!response.ok) {
          console.error(`Reply generation failed: ${response.status}`);
          return null;
        }

        const data = await response.json();
        return data.reply || data.content;
        
      } catch (error) {
        console.error('Failed to generate reply:', error);
        return null;
      }
    }

    shouldSendBatchNotification() {
      const now = Date.now();
      const timeSinceLastNotification = now - this.lastNotificationTime;
      const pendingCount = this.batchOpportunities.length;
      
      // Notify if we have 3+ opportunities OR 2+ minutes since last notification
      return (pendingCount >= 3) || (pendingCount >= 1 && timeSinceLastNotification > 120000);
    }

    async sendBatchNotification() {
      const count = this.batchOpportunities.length;
      if (count === 0) return;
      
      this.lastNotificationTime = Date.now();
      
      // Send message to background script for notification
      chrome.runtime.sendMessage({
        action: 'showBatchNotification',
        count: count,
        opportunities: this.batchOpportunities.slice(0, 5) // Send first 5 for preview
      });
      
      console.log(`Sent batch notification for ${count} opportunities`);
    }

    async storeBatchOpportunities() {
      try {
        await chrome.storage.local.set({
          xthreads_batch_opportunities: this.batchOpportunities
        });
      } catch (error) {
        console.error('Failed to store batch opportunities:', error);
      }
    }

    cleanupOldOpportunities() {
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const initialCount = this.batchOpportunities.length;
      
      this.batchOpportunities = this.batchOpportunities.filter(
        opportunity => opportunity.foundAt > oneHourAgo
      );
      
      const removedCount = initialCount - this.batchOpportunities.length;
      if (removedCount > 0) {
        console.log(`Cleaned up ${removedCount} old opportunities`);
        this.storeBatchOpportunities();
      }
    }

    extractTweetData(tweetElement) {
      try {
        const textElement = tweetElement.querySelector('[data-testid="tweetText"]');
        const linkElement = tweetElement.querySelector('a[href*="/status/"]');
        const timeElement = tweetElement.querySelector('time');
        
        if (!textElement || !linkElement) return null;
        
        const content = textElement.textContent.trim();
        const tweetUrl = linkElement.href;
        const tweetId = tweetUrl.match(/\/status\/(\d+)/)?.[1];
        const timestamp = timeElement ? new Date(timeElement.dateTime).getTime() : Date.now();
        
        return {
          id: tweetId,
          content: content,
          url: tweetUrl,
          timestamp: timestamp
        };
      } catch (error) {
        console.error('Failed to extract tweet data:', error);
        return null;
      }
    }

    shouldReplyToTweet(tweetData, settings) {
      // Check if already replied
      if (this.repliedTweets.has(tweetData.id)) return false;
      
      // Check if tweet is recent (within last hour)
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      if (tweetData.timestamp < oneHourAgo) return false;
      
      // Check if tweet contains keywords (primary)
      const content = tweetData.content.toLowerCase();
      const keywords = settings.keywords || [];
      
      if (keywords.length > 0) {
        const hasKeyword = keywords.some(keyword => 
          content.includes(keyword.toLowerCase())
        );
        if (hasKeyword) return true;
      }
      
      // Fallback: Check for general engagement opportunities
      return this.isGoodReplyOpportunity(tweetData, content);
    }

    isGoodReplyOpportunity(tweetData, content) {
      // Skip if too many replies already (indicates high engagement tweet)
      const tweetElement = document.querySelector(`[href*="${tweetData.id}"]`)?.closest('[data-testid="tweet"]');
      if (tweetElement) {
        const replyButton = tweetElement.querySelector('[data-testid="reply"]');
        const replyCount = replyButton?.textContent?.trim();
        if (replyCount && parseInt(replyCount) > 50) {
          return false; // Skip tweets with 50+ replies
        }
      }
      
      // Look for engagement patterns that suggest good reply opportunities
      const engagementPatterns = [
        // Questions
        /\?$/,
        /what.*think/i,
        /anyone.*know/i,
        /thoughts.*on/i,
        
        // Statements seeking validation/discussion
        /agree.*disagree/i,
        /unpopular.*opinion/i,
        /controversial.*take/i,
        /hot.*take/i,
        
        // Experience sharing
        /in my experience/i,
        /learned.*lesson/i,
        /mistake.*made/i,
        /tip.*trick/i,
        
        // Common business/tech keywords
        /startup/i,
        /entrepreneur/i,
        /product.*launch/i,
        /growth.*hack/i,
        /marketing/i,
        /saas/i,
        /build.*public/i,
        /side.*project/i,
        /freelanc/i,
        /remote.*work/i
      ];
      
      return engagementPatterns.some(pattern => pattern.test(content));
    }

    showAgenticReplyNotification(tweetData, reply) {
      // Remove existing notifications
      const existing = document.querySelector('.xthreads-agentic-notification');
      if (existing) existing.remove();

      const notification = document.createElement('div');
      notification.className = 'xthreads-agentic-notification';
      notification.innerHTML = `
        <div class="xthreads-notification-content">
          <div class="xthreads-notification-header">
            <h4>Agentic Reply Suggestion</h4>
            <button class="xthreads-notification-close">×</button>
          </div>
          <div class="xthreads-notification-body">
            <div class="xthreads-original-tweet">
              <strong>Original Tweet:</strong>
              <p>${tweetData.content.substring(0, 100)}${tweetData.content.length > 100 ? '...' : ''}</p>
            </div>
            <div class="xthreads-suggested-reply">
              <strong>Suggested Reply:</strong>
              <p>${reply}</p>
            </div>
          </div>
          <div class="xthreads-notification-actions">
            <button class="xthreads-btn-secondary xthreads-dismiss-btn">Dismiss</button>
            <button class="xthreads-btn-primary xthreads-review-btn">Review & Reply</button>
          </div>
        </div>
      `;

      document.body.appendChild(notification);

      // Bind notification events
      const closeBtn = notification.querySelector('.xthreads-notification-close');
      const dismissBtn = notification.querySelector('.xthreads-dismiss-btn');
      const reviewBtn = notification.querySelector('.xthreads-review-btn');

      const removeNotification = () => notification.remove();

      closeBtn.addEventListener('click', removeNotification);
      dismissBtn.addEventListener('click', removeNotification);
      
      reviewBtn.addEventListener('click', async () => {
        removeNotification();
        await this.handleAgenticReply(tweetData, reply);
      });

      // Auto-dismiss after 30 seconds
      setTimeout(removeNotification, 30000);
    }

    async handleAgenticReply(tweetData, reply) {
      try {
        // Navigate to tweet
        window.location.href = tweetData.url;
        await this.sleep(3000);

        // Find and click reply button
        const replyButton = document.querySelector('[data-testid="reply"]');
        if (!replyButton) {
          throw new Error('Reply button not found');
        }

        replyButton.click();
        await this.sleep(1500);

        // Find reply composer
        const replyComposer = document.querySelector('[data-testid="tweetTextarea_0"]') ||
                             document.querySelector('[role="textbox"][contenteditable="true"]');

        if (!replyComposer) {
          throw new Error('Reply composer not found');
        }

        // Type the reply
        await this.typeTextIntoComposer(replyComposer, reply);
        
        this.showToast('Reply ready! Click Post to send your response.', 'success');

        // Update stats
        chrome.runtime.sendMessage({
          action: 'updateStats',
          stats: { successCount: 1, repliesCount: 1 }
        });

      } catch (error) {
        console.error('Failed to handle agentic reply:', error);
        this.showToast('Failed to prepare reply. Please try manually.', 'error');
      }
    }

    async loadRepliedTweets() {
      try {
        const result = await chrome.storage.local.get('xthreads_replied_tweets');
        if (result.xthreads_replied_tweets) {
          const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
          const validTweets = result.xthreads_replied_tweets.filter(
            tweet => tweet.timestamp > cutoff
          );
          
          this.repliedTweets = new Set(validTweets.map(t => t.id));
        }
      } catch (error) {
        console.error('Failed to load replied tweets:', error);
      }
    }

    async getSettings() {
      try {
        const result = await chrome.storage.local.get('xthreads_settings');
        return result.xthreads_settings || {};
      } catch (error) {
        console.error('Failed to get settings:', error);
        return {};
      }
    }

    // Utility Functions
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    escapeHtml(text) {
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    showOpenPopupIndicator() {
      // Remove existing indicator
      const existing = document.querySelector('.xthreads-popup-indicator');
      if (existing) existing.remove();

      const indicator = document.createElement('div');
      indicator.className = 'xthreads-popup-indicator';
      indicator.innerHTML = `
        <div class="xthreads-indicator-content">
          <div class="xthreads-indicator-icon">
            <img src="${chrome.runtime.getURL('assets/icon16.png')}" width="20" height="20" />
          </div>
          <div class="xthreads-indicator-text">
            Click the xThreads extension icon to generate your reply
          </div>
          <button class="xthreads-indicator-close">×</button>
        </div>
      `;

      // Add styles
      const style = document.createElement('style');
      style.textContent = `
        .xthreads-popup-indicator {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 999999;
          background: #00bcd4;
          color: white;
          border-radius: 8px;
          padding: 12px 16px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 14px;
          max-width: 300px;
          animation: slideInRight 0.3s ease-out;
        }
        
        .xthreads-indicator-content {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .xthreads-indicator-text {
          flex: 1;
          line-height: 1.4;
        }
        
        .xthreads-indicator-close {
          background: none;
          border: none;
          color: white;
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }
        
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);

      document.body.appendChild(indicator);

      // Bind close button
      const closeBtn = indicator.querySelector('.xthreads-indicator-close');
      closeBtn.addEventListener('click', () => indicator.remove());

      // Auto-remove after 8 seconds
      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.remove();
        }
      }, 8000);
    }

    showToast(message, type = 'info') {
      const toast = document.createElement('div');
      toast.className = `xthreads-toast xthreads-toast-${type}`;
      toast.textContent = message;
      
      document.body.appendChild(toast);
      
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 4000);
    }
  }

  // Initialize content script
  new XThreadsContentScript();
}