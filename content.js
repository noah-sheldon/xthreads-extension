// Guard against multiple injections
if (!window.__xthreads_injected__) {
  window.__xthreads_injected__ = true;

  // Global stop typing state
  let globalStopTyping = false;

  class XThreadsContentScript {
    constructor() {
      this.settings = null;
      this.isActive = false;
      this.repliedTweets = new Set();
      this.currentModal = null;
      
      this.init();
    }

    init() {
      console.log('xThreads Content Script initialized');
      this.setupMessageListener();
      this.addInComposerButtons();
      this.loadRepliedTweets();
      
      // Watch for new composers and tweets
      this.setupDOMObserver();
    }

    setupMessageListener() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.action) {
          case 'startAgent':
            this.startAgent(message.settings);
            sendResponse({ success: true });
            break;

          case 'stopAgent':
            this.stopAgent();
            sendResponse({ success: true });
            break;

          case 'typeInComposer':
            this.typeInComposer(message.text);
            sendResponse({ success: true });
            break;

          case 'postThread':
            this.postThread(message.thread);
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
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check for new composers
              if (node.querySelector && (
                node.querySelector('[data-testid="tweetTextarea_0"]') ||
                node.matches('[data-testid="tweetTextarea_0"]')
              )) {
                setTimeout(() => this.addInComposerButtons(), 500);
              }
              
              // Check for new tweets
              if (node.querySelector && (
                node.querySelector('[data-testid="tweet"]') ||
                node.matches('[data-testid="tweet"]')
              )) {
                // New tweets detected - could be used for agentic monitoring
              }
            }
          });
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    addInComposerButtons() {
      // Find tweet composers
      const composers = document.querySelectorAll('[data-testid="tweetTextarea_0"]');
      
      composers.forEach(composer => {
        if (composer.closest('.xthreads-composer-enhanced')) return;
        
        const composerContainer = composer.closest('[data-testid="toolBar"]')?.parentElement;
        if (!composerContainer) return;

        // Mark as enhanced
        composerContainer.classList.add('xthreads-composer-enhanced');

        // Find toolbar or create button container
        const toolbar = composerContainer.querySelector('[data-testid="toolBar"]');
        if (toolbar && !toolbar.querySelector('.xthreads-composer-button')) {
          this.injectComposerButton(toolbar, composer);
        }
      });
    }

    injectComposerButton(toolbar, composer) {
      const button = document.createElement('button');
      button.className = 'xthreads-composer-button';
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
          <path d="M2 17L12 22L22 17"/>
          <path d="M2 12L12 17L22 12"/>
        </svg>
        <span>AI</span>
      `;
      button.title = 'xThreads AI Assistant';
      
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showComposerModal(composer);
      });

      // Insert at the beginning of toolbar
      toolbar.insertBefore(button, toolbar.firstChild);
    }

    showComposerModal(composer) {
      if (this.currentModal) {
        this.currentModal.remove();
      }

      const existingText = composer.textContent || '';
      
      const modal = document.createElement('div');
      modal.className = 'xthreads-modal';
      modal.innerHTML = `
        <div class="xthreads-modal-overlay">
          <div class="xthreads-modal-content">
            <div class="xthreads-modal-header">
              <h3>AI Content Assistant</h3>
              <button class="xthreads-modal-close">×</button>
            </div>
            <div class="xthreads-modal-body">
              <div class="xthreads-option-buttons">
                <button class="xthreads-option-btn" data-action="generate">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5,3 19,12 5,21"/>
                  </svg>
                  Generate New
                </button>
                <button class="xthreads-option-btn" data-action="rewrite" ${!existingText ? 'disabled' : ''}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Rewrite Existing
                </button>
              </div>
              
              <div class="xthreads-content-form" style="display: none;">
                <div class="xthreads-input-group">
                  <label>Prompt:</label>
                  <textarea class="xthreads-prompt-input" rows="3" placeholder="What do you want to write about?"></textarea>
                </div>
                
                <div class="xthreads-form-row">
                  <div class="xthreads-input-group">
                    <label>Tone:</label>
                    <select class="xthreads-tone-select">
                      <option value="neutral">Neutral</option>
                      <option value="professional">Professional</option>
                      <option value="casual">Casual</option>
                    </select>
                  </div>
                </div>
                
                <div class="xthreads-modal-actions">
                  <button class="xthreads-btn-secondary xthreads-back-btn">Back</button>
                  <button class="xthreads-btn-primary xthreads-generate-btn">Generate</button>
                </div>
              </div>
              
              <div class="xthreads-results" style="display: none;">
                <div class="xthreads-results-header">
                  <h4>Generated Content:</h4>
                  <div class="xthreads-stop-typing" style="display: none;">
                    <button class="xthreads-stop-btn">Stop Typing</button>
                  </div>
                </div>
                <div class="xthreads-results-list"></div>
              </div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      this.currentModal = modal;

      // Bind modal events
      this.bindModalEvents(modal, composer, existingText);
    }

    bindModalEvents(modal, composer, existingText) {
      const closeBtn = modal.querySelector('.xthreads-modal-close');
      const overlay = modal.querySelector('.xthreads-modal-overlay');
      const optionButtons = modal.querySelectorAll('.xthreads-option-btn');
      const contentForm = modal.querySelector('.xthreads-content-form');
      const backBtn = modal.querySelector('.xthreads-back-btn');
      const generateBtn = modal.querySelector('.xthreads-generate-btn');
      const promptInput = modal.querySelector('.xthreads-prompt-input');
      const stopBtn = modal.querySelector('.xthreads-stop-btn');

      // Close modal
      const closeModal = () => {
        globalStopTyping = true;
        modal.remove();
        this.currentModal = null;
      };

      closeBtn.addEventListener('click', closeModal);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });

      // Option selection
      optionButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          
          // Hide option buttons, show form
          modal.querySelector('.xthreads-option-buttons').style.display = 'none';
          contentForm.style.display = 'block';
          
          // Pre-fill for rewrite
          if (action === 'rewrite' && existingText) {
            promptInput.value = existingText;
            promptInput.placeholder = 'Edit the content above or describe how to rewrite it...';
          }
          
          generateBtn.dataset.action = action;
        });
      });

      // Back button
      backBtn.addEventListener('click', () => {
        modal.querySelector('.xthreads-option-buttons').style.display = 'block';
        contentForm.style.display = 'none';
        modal.querySelector('.xthreads-results').style.display = 'none';
      });

      // Generate button
      generateBtn.addEventListener('click', () => {
        this.handleModalGenerate(modal, composer, generateBtn.dataset.action);
      });

      // Stop typing button
      stopBtn.addEventListener('click', () => {
        globalStopTyping = true;
        modal.querySelector('.xthreads-stop-typing').style.display = 'none';
      });

      // Focus prompt input
      setTimeout(() => promptInput.focus(), 100);
    }

    async handleModalGenerate(modal, composer, action) {
      const promptInput = modal.querySelector('.xthreads-prompt-input');
      const toneSelect = modal.querySelector('.xthreads-tone-select');
      const generateBtn = modal.querySelector('.xthreads-generate-btn');
      const resultsContainer = modal.querySelector('.xthreads-results');
      const resultsList = modal.querySelector('.xthreads-results-list');

      const prompt = promptInput.value.trim();
      if (!prompt) {
        this.showToast('Please enter a prompt', 'error');
        return;
      }

      // Get settings from storage
      const settings = await this.getSettings();
      if (!settings.apiKey || !settings.selectedBrandId) {
        this.showToast('Please configure API key and brand space in extension settings', 'error');
        return;
      }

      // Show loading
      generateBtn.disabled = true;
      generateBtn.textContent = 'Generating...';

      try {
        let endpoint, body;
        
        if (action === 'generate') {
          endpoint = 'https://www.xthreads.app/api/generate-tweet';
          body = {
            prompt: prompt,
            brandId: settings.selectedBrandId,
            tone: toneSelect.value
          };
        } else {
          endpoint = 'https://www.xthreads.app/api/rewrite-content';
          body = {
            originalContent: prompt,
            brandId: settings.selectedBrandId,
            tone: toneSelect.value
          };
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': settings.apiKey
          },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        let results = [];
        
        if (action === 'generate') {
          results = [data.tweet];
        } else {
          results = data.variations || [data.rewrittenContent];
        }

        // Validate and truncate results
        results = results.filter(Boolean).map(content => {
          if (content.length > 280) {
            this.showToast('Content truncated to 280 characters', 'info');
            return content.substring(0, 277) + '...';
          }
          return content;
        });

        if (results.length === 0) {
          throw new Error('No content generated');
        }

        // Show results
        this.displayModalResults(modal, results, composer);

      } catch (error) {
        console.error('Failed to generate content:', error);
        this.showToast('Failed to generate content. Please try again.', 'error');
      } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate';
      }
    }

    displayModalResults(modal, results, composer) {
      const resultsContainer = modal.querySelector('.xthreads-results');
      const resultsList = modal.querySelector('.xthreads-results-list');
      
      resultsContainer.style.display = 'block';
      resultsList.innerHTML = '';

      results.forEach((content, index) => {
        const resultItem = document.createElement('div');
        resultItem.className = 'xthreads-result-item';
        resultItem.innerHTML = `
          <div class="xthreads-result-text">${content}</div>
          <div class="xthreads-result-actions">
            <button class="xthreads-use-btn" data-content="${this.escapeHtml(content)}">Use This</button>
          </div>
        `;
        
        resultsList.appendChild(resultItem);
      });

      // Bind use buttons
      resultsList.querySelectorAll('.xthreads-use-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const content = btn.dataset.content;
          this.typeTextIntoComposer(composer, content);
          modal.remove();
          this.currentModal = null;
        });
      });
    }

    async typeInComposer(text) {
      const composer = document.querySelector('[data-testid="tweetTextarea_0"]') ||
                      document.querySelector('[role="textbox"][contenteditable="true"]');
      
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

      await this.typeTextIntoComposer(composer, text);
    }

    async typeTextIntoComposer(composer, text) {
      // Reset global stop state
      globalStopTyping = false;
      
      // Show stop button if modal is open
      if (this.currentModal) {
        const stopContainer = this.currentModal.querySelector('.xthreads-stop-typing');
        if (stopContainer) stopContainer.style.display = 'block';
      }

      composer.focus();
      composer.textContent = '';

      // Type character by character with human-like delays
      for (let i = 0; i < text.length; i++) {
        if (globalStopTyping) {
          console.log('Typing stopped by user');
          break;
        }

        const char = text[i];
        composer.textContent = text.substring(0, i + 1);
        
        // Trigger input events for X.com recognition
        composer.dispatchEvent(new Event('input', { bubbles: true }));
        composer.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Variable delays: 50-150ms, longer for punctuation
        let delay = Math.floor(Math.random() * 100) + 50; // 50-150ms
        if (['.', '!', '?', ',', ';', ':'].includes(char)) {
          delay += Math.floor(Math.random() * 200) + 100; // +100-300ms for punctuation
        }
        if (char === '\n') {
          delay += Math.floor(Math.random() * 300) + 200; // +200-500ms for newlines
        }
        
        await this.sleep(delay);
      }

      // Hide stop button
      if (this.currentModal) {
        const stopContainer = this.currentModal.querySelector('.xthreads-stop-typing');
        if (stopContainer) stopContainer.style.display = 'none';
      }

      // Final events
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      composer.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async postThread(thread) {
      if (!thread || thread.length === 0) return;

      try {
        // Navigate to compose if not already there
        if (!window.location.href.includes('/compose/tweet')) {
          window.location.href = 'https://x.com/compose/tweet';
          await this.sleep(3000);
        }
        
        for (let i = 0; i < thread.length; i++) {
          if (globalStopTyping) break;
          
          const tweet = thread[i];
          
          // Find the current tweet composer
          const composer = document.querySelector('[data-testid="tweetTextarea_0"]') ||
                          document.querySelector(`[data-testid="tweetTextarea_${i}"]`) ||
                          document.querySelector('div[role="textbox"][contenteditable="true"]');
          
          if (!composer) {
            throw new Error(`Tweet composer not found for tweet ${i + 1}`);
          }
          
          // Type the tweet
          await this.typeTextIntoComposer(composer, tweet);
          
          if (globalStopTyping) break;
          
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
        
        this.showToast('Thread ready to post! Click the Post button to publish.', 'success');
        
      } catch (error) {
        console.error('Failed to post thread:', error);
        this.showToast('Failed to prepare thread. Please try again.', 'error');
      }
    }

    // Agentic Reply Functions
    startAgent(settings) {
      this.settings = settings;
      this.isActive = true;
      console.log('xThreads Agent started');
    }

    stopAgent() {
      this.isActive = false;
      console.log('xThreads Agent stopped');
    }

    async scanForAgenticReplies(settings) {
      if (!this.isActive || !settings) return;

      try {
        // Wait for page to load completely
        await this.sleep(2000);

        // Find tweets on search results page
        const tweets = document.querySelectorAll('[data-testid="tweet"]');
        
        for (const tweet of tweets) {
          const tweetData = this.extractTweetData(tweet);
          
          if (tweetData && this.shouldReplyToTweet(tweetData, settings)) {
            // Send to background script for processing
            chrome.runtime.sendMessage({
              action: 'agenticReplyRequest',
              tweetData: tweetData
            });
            
            // Only process one tweet per scan to avoid spam
            break;
          }
        }
        
      } catch (error) {
        console.error('Failed to scan for agentic replies:', error);
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
      
      // Check if tweet contains keywords
      const content = tweetData.content.toLowerCase();
      const hasKeyword = settings.keywords.some(keyword => 
        content.includes(keyword.toLowerCase())
      );
      
      return hasKeyword;
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