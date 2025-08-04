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
      
      // Clear any existing intervals
      if (this.scanInterval) {
        clearInterval(this.scanInterval);
        this.scanInterval = null;
      }
      
      console.log('🚀 xThreads Agent started - One-time comprehensive scan for 10 opportunities');
      
      // Clear previous opportunities when starting new scan
      this.batchOpportunities = [];
      this.storeBatchOpportunities();
      
      // Start comprehensive scan immediately
      setTimeout(() => this.performComprehensiveScan(), 2000);
    }

    stopAgent() {
      this.isActive = false;
      
      // Clear scanning interval if exists
      if (this.scanInterval) {
        clearInterval(this.scanInterval);
        this.scanInterval = null;
      }
      
      console.log('🛑 xThreads Agent stopped');
    }

    async performComprehensiveScan() {
      if (!this.isActive || !this.settings) return;
      
      const maxOpportunities = 10;
      console.log(`🔍 Starting simplified scan for ${maxOpportunities} opportunities on current page...`);
      
      try {
        // Single phase: Scan current page with deep scrolling
        console.log('📄 Scanning current page with deep auto-scroll...');
        await this.scanCurrentPageWithDeepScroll();
        
        // Complete scan regardless of count found
        return this.completeScan();
        
      } catch (error) {
        console.error('❌ Scan failed:', error);
        this.completeScan();
      }
    }
    
    async scanCurrentPageWithDeepScroll() {
      const maxOpportunities = 10;
      let foundTotal = 0;
      
      try {
        console.log('📄 Starting deep scroll scan (10 scrolls)...');
        
        // Deep auto-scroll to load more tweets (10 scrolls)
        for (let i = 0; i < 10 && this.batchOpportunities.length < maxOpportunities; i++) {
          console.log(`📜 Scroll ${i + 1}/10... (current opportunities: ${this.batchOpportunities.length}/${maxOpportunities})`);
          
          // Check if we've reached the limit before scrolling
          if (this.batchOpportunities.length >= maxOpportunities) {
            console.log(`🛑 Reached ${maxOpportunities} opportunities limit, stopping scan`);
            break;
          }
          
          window.scrollTo(0, document.body.scrollHeight);
          await this.sleep(2000); // Wait for new tweets to load
          
          // Scan new tweets after each scroll
          const newTweets = await this.scanNewTweetsOnPage();
          foundTotal += newTweets;
          
          if (newTweets > 0) {
            console.log(`🎯 Found ${newTweets} new opportunities after scroll ${i + 1} (total: ${this.batchOpportunities.length})`);
          }
          
          // Double-check limit after scanning
          if (this.batchOpportunities.length >= maxOpportunities) {
            console.log(`🛑 Reached ${maxOpportunities} opportunities after scanning, stopping`);
            break;
          }
        }
        
        console.log(`📊 Deep scroll complete: Found ${foundTotal} total opportunities`);
        return foundTotal;
        
      } catch (error) {
        console.error('Failed to perform deep scroll scan:', error);
        return foundTotal;
      }
    }
    
    async scanNewTweetsOnPage() {
      const maxOpportunities = 10;
      let foundOnThisPass = 0;
      
      try {
        const tweets = document.querySelectorAll('[data-testid="tweet"]');
        
        for (const tweet of tweets) {
          if (this.batchOpportunities.length >= maxOpportunities) break;
          
          const tweetData = this.extractTweetData(tweet);
          
          if (tweetData && this.isGrowthOpportunity(tweetData, this.settings)) {
            // Check if we already have this opportunity (in current batch OR in storage)
            const existsInBatch = this.batchOpportunities.some(op => op.id === tweetData.id);
            const existsInStorage = await this.checkIfTweetProcessed(tweetData.id);
            
            if (!existsInBatch && !existsInStorage) {
              console.log(`✅ Found opportunity: ${tweetData.content.substring(0, 50)}...`);
              
              // Generate reply for this opportunity
              console.log(`🔄 Generating reply for tweet: ${tweetData.id}`);
              const reply = await this.generateReplyForTweet(tweetData);
              console.log(`📝 Reply generated:`, reply ? `"${reply.substring(0, 50)}..."` : 'FAILED');
              
              if (reply) {
                const opportunity = {
                  ...tweetData,
                  reply: reply,
                  foundAt: Date.now(),
                  source: 'current page'
                };
                
                this.batchOpportunities.push(opportunity);
                foundOnThisPass++;
                
                // Store opportunities immediately
                await this.storeBatchOpportunities();
                console.log(`💾 Stored ${this.batchOpportunities.length} opportunities to storage`);
                
                // Send live update to popup
                this.sendLiveUpdate();
                
                console.log(`🎯 Opportunity ${this.batchOpportunities.length}/${maxOpportunities} added and stored`);
              } else {
                console.log(`❌ Failed to generate reply for tweet ${tweetData.id}, skipping`);
              }
            } else {
              if (existsInBatch) {
                console.log(`⏭️  Tweet ${tweetData.id} already in current batch, skipping`);
              }
              if (existsInStorage) {
                console.log(`⏭️  Tweet ${tweetData.id} already in storage, skipping`);
              }
            }
          }
        }
        
        return foundOnThisPass;
        
      } catch (error) {
        console.error('Failed to scan new tweets:', error);
        return foundOnThisPass;
      }
    }
    
    
    async completeScan() {
      console.log(`🏁 Comprehensive scan completed! Found ${this.batchOpportunities.length} growth opportunities`);
      
      // Store all opportunities
      await this.storeBatchOpportunities();
      
      // Send final notification
      if (this.batchOpportunities.length > 0) {
        this.sendBatchNotification(true); // Mark as scan complete
      }
      
      // Turn off agent
      this.isActive = false;
      
      // Notify popup that agent has stopped
      try {
        chrome.runtime.sendMessage({
          action: 'agentStopped',
          reason: 'scanComplete',
          opportunitiesFound: this.batchOpportunities.length
        });
        console.log('📱 Sent agent stopped message to popup');
      } catch (error) {
        console.log('Could not notify popup of agent stop:', error);
      }
      
      console.log('🛑 Agent automatically stopped after comprehensive scan');
    }
    
    sendLiveUpdate() {
      // Send live update to background script for popup badge
      chrome.runtime.sendMessage({
        action: 'liveOpportunityUpdate',
        count: this.batchOpportunities.length,
        opportunities: this.batchOpportunities.slice(-3) // Send last 3 for preview
      });
    }

    async scanForAgenticReplies(settings) {
      // This method is called from popup for manual refresh - now uses comprehensive scan
      this.settings = settings;
      await this.performComprehensiveScan();
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

    async sendBatchNotification(scanComplete = false) {
      const count = this.batchOpportunities.length;
      if (count === 0) return;
      
      this.lastNotificationTime = Date.now();
      
      // Send message to background script for notification
      chrome.runtime.sendMessage({
        action: 'showBatchNotification',
        count: count,
        opportunities: this.batchOpportunities.slice(0, 5), // Send first 5 for preview
        scanComplete: scanComplete
      });
      
      console.log(`📢 Sent batch notification for ${count} opportunities${scanComplete ? ' (scan complete)' : ''}`);
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

    async checkIfTweetProcessed(tweetId) {
      try {
        // Check if tweet exists in stored opportunities
        const result = await chrome.storage.local.get('xthreads_batch_opportunities');
        const storedOpportunities = result.xthreads_batch_opportunities || [];
        
        const alreadyProcessed = storedOpportunities.some(op => op.id === tweetId);
        
        if (alreadyProcessed) {
          console.log(`⏭️  Tweet ${tweetId} already processed, skipping`);
          return true;
        }
        
        return false;
      } catch (error) {
        console.error('Failed to check if tweet processed:', error);
        return false; // If we can't check, allow processing
      }
    }

    cleanupOldOpportunities() {
      // Only cleanup when starting a new scan - opportunities persist until manual clear or new scan
      // This method is kept for backwards compatibility but does nothing now
      console.log('🧹 Cleanup skipped - opportunities persist until manual clear or new scan');
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

    isGrowthOpportunity(tweetData, settings) {
      // Check if already replied
      if (this.repliedTweets.has(tweetData.id)) return false;
      
      // Check if tweet is recent (within last 4 hours for better growth potential)
      const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
      if (tweetData.timestamp < fourHoursAgo) return false;
      
      const content = tweetData.content.toLowerCase();
      const tweetElement = document.querySelector(`[href*="${tweetData.id}"]`)?.closest('[data-testid="tweet"]');
      
      // Growth-focused engagement metrics
      if (!this.hasGrowthPotential(tweetElement)) return false;
      
      // Primary: Check for relevant keyword matching (must be profile-relevant)
      const keywords = settings.keywords || [];
      if (keywords.length > 0) {
        const relevanceScore = this.calculateKeywordRelevance(content, keywords);
        console.log(`🎯 Tweet relevance score: ${relevanceScore} for: "${tweetData.content.substring(0, 50)}..."`);
        
        // Only consider tweets with high relevance (score >= 2)
        if (relevanceScore >= 2) {
          console.log(`✅ Tweet is highly relevant to profile keywords`);
          return true;
        } else {
          console.log(`❌ Tweet not relevant enough (score: ${relevanceScore}, need: 2+)`);
          return false;
        }
      }
      
      // If no keywords, fall back to founder/startup patterns only
      return this.isFounderRelevantContent(content);
    }

    hasGrowthPotential(tweetElement) {
      if (!tweetElement) return true; // Default to true if we can't analyze
      
      try {
        // Check engagement metrics for growth potential (5-100 likes range)
        const likeButton = tweetElement.querySelector('[data-testid="like"]');
        const retweetButton = tweetElement.querySelector('[data-testid="retweet"]');
        const replyButton = tweetElement.querySelector('[data-testid="reply"]');
        
        const likeCount = this.extractCount(likeButton?.textContent);
        const retweetCount = this.extractCount(retweetButton?.textContent);
        const replyCount = this.extractCount(replyButton?.textContent);
        
        // Relaxed growth range: 1-50 likes, not oversaturated with replies
        const hasGoodEngagement = likeCount >= 1 && likeCount <= 50;
        const notOversaturated = replyCount < 25; // Less competition
        
        console.log(`📊 Tweet engagement: ${likeCount} likes, ${replyCount} replies, ${retweetCount} retweets`);
        
        return hasGoodEngagement && notOversaturated;
        
      } catch (error) {
        console.log('Could not analyze engagement metrics, defaulting to true');
        return true;
      }
    }
    
    extractCount(text) {
      if (!text) return 0;
      const match = text.match(/[\d,]+/);
      return match ? parseInt(match[0].replace(/,/g, '')) : 0;
    }

    calculateKeywordRelevance(content, keywords) {
      let score = 0;
      const words = content.split(/\s+/);
      
      for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase();
        const keywordWords = keywordLower.split(/\s+/);
        
        // Exact phrase match (highest score)
        if (content.includes(keywordLower)) {
          score += 3;
          console.log(`📈 +3 points: Exact phrase match for "${keyword}"`);
        }
        
        // Partial word matches within context
        const matchingWords = keywordWords.filter(kw => 
          words.some(word => word.includes(kw) && kw.length > 2)
        );
        
        if (matchingWords.length > 0) {
          const partialScore = matchingWords.length;
          score += partialScore;
          console.log(`📈 +${partialScore} points: Partial matches for "${keyword}" (${matchingWords.join(', ')})`);
        }
        
        // Context bonus: keyword appears in meaningful context
        if (this.isKeywordInContext(content, keywordLower)) {
          score += 1;
          console.log(`📈 +1 point: Contextual relevance for "${keyword}"`);
        }
      }
      
      // Tweet focus bonus: keywords make up significant portion of tweet
      const keywordDensity = this.calculateKeywordDensity(content, keywords);
      if (keywordDensity > 0.2) { // 20%+ of tweet is about keywords
        score += 2;
        console.log(`📈 +2 points: High keyword density (${Math.round(keywordDensity * 100)}%)`);
      }
      
      return score;
    }
    
    isKeywordInContext(content, keyword) {
      // Check if keyword appears with relevant context words
      const contextPatterns = [
        // Questions/discussions about the topic
        new RegExp(`(what|how|why|when|where).*${keyword}`, 'i'),
        new RegExp(`${keyword}.*(think|opinion|thoughts|advice)`, 'i'),
        
        // Experience sharing
        new RegExp(`(my|our|been).*${keyword}`, 'i'),
        new RegExp(`${keyword}.*(experience|journey|story)`, 'i'),
        
        // Problems/solutions
        new RegExp(`(problem|issue|challenge).*${keyword}`, 'i'),
        new RegExp(`${keyword}.*(solution|help|tips)`, 'i'),
        
        // Learning/sharing
        new RegExp(`(learned|discovered|found).*${keyword}`, 'i'),
        new RegExp(`${keyword}.*(lesson|insight|takeaway)`, 'i')
      ];
      
      return contextPatterns.some(pattern => pattern.test(content));
    }
    
    calculateKeywordDensity(content, keywords) {
      const words = content.split(/\s+/).length;
      let keywordWordCount = 0;
      
      for (const keyword of keywords) {
        const keywordWords = keyword.toLowerCase().split(/\s+/);
        keywordWordCount += keywordWords.length;
      }
      
      return words > 0 ? keywordWordCount / words : 0;
    }

    isFounderRelevantContent(content) {
      // Only match highly relevant founder/startup content when no keywords provided
      const founderPatterns = [
        // Direct founder/startup topics
        /\b(founder|startup|entrepreneur|indie hacker|bootstrapper|side project)\b/i,
        /\b(building in public|build in public|solo founder|technical founder)\b/i,
        /\b(saas|mvp|product launch|first sale|early traction)\b/i,
        
        // Founder-specific questions/discussions
        /\b(founder|startup).*\?(.*)?/i,
        /(what|how|why).*(founder|startup|build|launch)/i,
        /(advice|tips|help).*(founder|startup|entrepreneur)/i,
        
        // Founder journey/experience sharing
        /(my|our).*(startup|product|saas|founder).*journey/i,
        /(learned|mistake|lesson).*(startup|founder|entrepreneur)/i,
        /(quit|left).*job.*(startup|founder)/i,
        
        // Product/business building
        /\b(shipping|launched|built).*\b(product|saas|app|mvp)\b/i,
        /\b(first|100|1000).*(user|customer|sale|revenue)\b/i,
        /\b(growth|traction|metrics|revenue)\b.*\b(startup|saas|product)\b/i
      ];
      
      const hasFounderContent = founderPatterns.some(pattern => pattern.test(content));
      
      if (hasFounderContent) {
        console.log(`✅ Tweet matches founder-relevant patterns`);
        return true;
      }
      
      console.log(`❌ Tweet not founder-relevant enough`);
      return false;
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