// Guard against multiple injections
if (!window.__xthreads_popup_injected__) {
  window.__xthreads_popup_injected__ = true;

  class XThreadsPopup {
    constructor() {
      this.settings = {
        apiKey: "",
        selectedBrandId: "",
        keywords: [],
        tone: "professional",
        isOnboarded: false,
        isActive: false,
      };

      this.stats = {
        repliesCount: 0,
        successCount: 0,
        totalAttempts: 0,
      };

      this.brandSpaces = [];
      this.currentTab = "generate";
      this.currentThread = [];
      this.batchOpportunityCount = 0;
      this.conversationRestored = false;

      this.init();
    }

    async init() {
      await this.loadSettings();

      // Check if user has completed onboarding
      if (!this.settings.isOnboarded || !this.settings.apiKey) {
        chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
        window.close();
        return;
      }

      this.bindEvents();
      this.updateApiKeyDisplay();
      this.loadDefaultTone();
      await this.loadBrandSpaces(); // Wait for brand spaces to load
      await this.restoreConversationHistory(); // Restore 24-hour conversation
      await this.restoreLastGenerated(); // Restore any previously generated content
      await this.loadHistory(); // Load history for history tab
      this.updateUI();
      this.updateStats();
      await this.checkForTweetData(); // Check if we should open reply tab
      await this.checkForRewriteData(); // Check if we should open rewrite tab
      await this.checkForBatchOpportunities(); // Check for batch opportunities
      
      // Add window focus listener to restore conversation
      window.addEventListener('focus', async () => {
        await this.restoreConversationHistory();
      });
      await this.checkForActiveOpportunity(); // Check for active opportunity from opened tabs
      
      // Badge functionality removed
    }

    async loadSettings() {
      try {
        const result = await chrome.storage.local.get([
          "xthreads_settings",
          "xthreads_stats",
        ]);
        if (result.xthreads_settings) {
          this.settings = { ...this.settings, ...result.xthreads_settings };
        }
        if (result.xthreads_stats) {
          this.stats = { ...this.stats, ...result.xthreads_stats };
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    }

    async saveSettings() {
      try {
        await chrome.storage.local.set({
          xthreads_settings: this.settings,
        });
      } catch (error) {
        console.error("Failed to save settings:", error);
      }
    }

    async loadBrandSpaces() {
      if (!this.settings.apiKey) return;

      try {
        const response = await fetch(
          "https://www.xthreads.app/api/api-brandspaces",
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.settings.apiKey,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          this.brandSpaces = data || [];
          console.log("Loaded brand spaces:", this.brandSpaces);
          this.updateBrandSpaceSelectors();
        } else {
          console.error("Failed to load brand spaces:", response.status);
          this.brandSpaces = [];
          this.updateBrandSpaceSelectors();
          this.showToast(`Failed to load brand spaces: ${response.status}`, "error");
        }
      } catch (error) {
        console.error("Failed to load brand spaces:", error);
        this.brandSpaces = [];
        this.updateBrandSpaceSelectors();
        this.showToast("Failed to load brand spaces. Please check your connection.", "error");
      }
    }

    updateBrandSpaceSelectors() {
      const select = document.getElementById("settingsBrandSpace");
      if (select) {
        select.innerHTML = "";
        console.log("Updating brand space selector with:", this.brandSpaces);
        console.log("Current selectedBrandId:", this.settings.selectedBrandId);

        if (this.brandSpaces.length === 0) {
          select.innerHTML = '<option value="">No brand spaces available</option>';
          select.disabled = true;
        } else {
          select.disabled = false;
          select.innerHTML = '<option value="">Select brand space</option>';
          this.brandSpaces.forEach((brand) => {
            const option = document.createElement("option");
            option.value = brand._id;
            option.textContent = brand.name;
            option.selected = brand._id === this.settings.selectedBrandId;
            console.log(`Brand: ${brand.name}, ID: ${brand._id}, Selected: ${option.selected}`);
            select.appendChild(option);
          });
          
          // Ensure the dropdown reflects the selected value
          if (this.settings.selectedBrandId) {
            select.value = this.settings.selectedBrandId;
          }
        }
        
        // If no brand is selected but we have brands, show a warning
        if (this.brandSpaces.length > 0 && !this.settings.selectedBrandId) {
          this.showToast("Please select a brand space to continue", "info");
        }
      }
    }

    bindEvents() {
      // Action dropdown navigation
      const actionSelect = document.getElementById('actionSelect');
      if (actionSelect) {
        actionSelect.addEventListener('change', (e) => {
          this.switchTab(e.target.value);
        });
      }

      // Header buttons  
      document.getElementById("historyBtn").addEventListener("click", () => {
        this.openHistoryModal();
      });

      document.getElementById("settingsBtn").addEventListener("click", async () => {
        await this.openSettings();
      });

      document.getElementById("closeSettings").addEventListener("click", () => {
        this.closeSettings();
      });

      // History modal events
      document.getElementById("closeHistory").addEventListener("click", () => {
        this.closeHistoryModal();
      });

      // History tab switching
      document.querySelectorAll('.history-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
          this.switchHistoryTab(e.target.dataset.type);
        });
      });

      // Clear history button
      document.getElementById('clearHistoryBtn').addEventListener('click', () => {
        this.clearAllHistory();
      });

      // New unified input system
      this.bindUnifiedInput();
      
      // Bind legacy events for backward compatibility
      this.bindGenerateEvents();
      this.bindRewriteEvents();
      this.bindThreadEvents();
      this.bindReplyEvents();
      this.bindBatchEvents();
      this.bindAgentEvents();
      this.bindSettingsEvents();
    }

    bindUnifiedInput() {
      const input = document.getElementById("contentInput");
      const sendBtn = document.getElementById("sendBtn");
      const toneSelect = document.getElementById("toneSelect");
      const charCountContainer = document.getElementById("charCountContainer");
      const charCount = document.getElementById("charCount");

      if (!input || !sendBtn) return; // Exit if required elements don't exist

      // Auto-resize textarea
      input.addEventListener("input", (e) => {
        const target = e.target;
        target.style.height = 'auto';
        target.style.height = Math.min(target.scrollHeight, 120) + 'px';
        
        // Update char count for rewrite mode
        if (this.currentTab === 'rewrite' && charCount && charCountContainer) {
          const length = target.value.length;
          charCount.textContent = length;
          if (length > 280) {
            charCount.style.color = 'var(--destructive)';
            charCountContainer.style.display = 'block';
          } else if (length > 0) {
            charCount.style.color = 'var(--muted-foreground)';
            charCountContainer.style.display = 'block';
          } else {
            charCountContainer.style.display = 'none';
          }
        } else if (charCountContainer) {
          charCountContainer.style.display = 'none';
        }

        // Enable/disable send button
        sendBtn.disabled = target.value.trim().length === 0;

        // Sync with hidden inputs for backward compatibility
        this.syncInputs(target.value);
      });

      // Send button
      sendBtn.addEventListener("click", () => {
        this.handleSend();
      });

      // Enter key to send
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (!sendBtn.disabled) {
            this.handleSend();
          }
        }
      });

      // Tone selection - sync with hidden selects
      if (toneSelect) {
        toneSelect.addEventListener("change", (e) => {
          this.syncToneSelects(e.target.value);
        });
      }
    }

    syncInputs(value) {
      // Sync with hidden inputs for backward compatibility
      const inputs = ["generateInput", "rewriteInput", "threadInput"];
      inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = value;
      });
    }

    syncToneSelects(value) {
      // Sync with hidden tone selects for backward compatibility
      const selects = ["generateTone", "rewriteTone", "threadTone"];
      selects.forEach(id => {
        const select = document.getElementById(id);
        if (select) select.value = value;
      });
    }

    handleSend() {
      const input = document.getElementById("contentInput");
      if (!input.value.trim()) return;

      // Add user message to chat
      this.addUserMessage(input.value.trim());

      // Clear input and show loading
      const userInput = input.value.trim();
      input.value = "";
      input.style.height = 'auto';
      document.getElementById("sendBtn").disabled = true;
      document.getElementById("charCountContainer").style.display = 'none';

      // Execute based on current tab
      switch (this.currentTab) {
        case 'generate':
          this.generateTweet();
          break;
        case 'rewrite':
          this.rewriteContent();
          break;
        case 'thread':
          this.generateThreadUnified(userInput);
          break;
        default:
          break;
      }
    }

    async addUserMessage(text) {
      const messagesContainer = document.getElementById("messagesContainer");
      const userMessage = document.createElement("div");
      userMessage.className = "message-bubble user";
      userMessage.innerHTML = `
        <div class="message-content">
          <p>${this.escapeHtml(text)}</p>
        </div>
      `;
      
      // Hide welcome message if it exists
      const welcomeMessage = messagesContainer.querySelector(".welcome-message");
      if (welcomeMessage) {
        welcomeMessage.style.display = "none";
      }
      
      messagesContainer.appendChild(userMessage);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      
      // Store in conversation history
      await this.saveConversationMessage({
        type: 'user',
        content: text,
        timestamp: Date.now()
      });
    }

    async addAssistantMessage(content, actions = []) {
      const messagesContainer = document.getElementById("messagesContainer");
      const assistantMessage = document.createElement("div");
      assistantMessage.className = "message-bubble assistant";
      
      let actionsHtml = "";
      if (actions.length > 0) {
        actionsHtml = `
          <div class="message-actions">
            ${actions.map(action => `
              <button class="action-btn-small" data-action="${action.type}" data-text="${this.escapeHtml(action.text || content)}">
                ${action.icon}
                ${action.label}
              </button>
            `).join('')}
          </div>
        `;
      }
      
      assistantMessage.innerHTML = `
        <div class="message-content">
          <p>${this.formatTweetTextForDisplay(content)}</p>
          ${actionsHtml}
        </div>
      `;
      
      messagesContainer.appendChild(assistantMessage);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      
      // Store in conversation history
      await this.saveConversationMessage({
        type: 'assistant',
        content: content,
        actions: actions,
        timestamp: Date.now()
      });

      // Bind action buttons
      assistantMessage.querySelectorAll(".action-btn-small").forEach(btn => {
        btn.addEventListener("click", (e) => {
          const actionType = btn.dataset.action;
          const text = btn.dataset.text;
          
          switch (actionType) {
            case 'copy':
              this.copyToClipboard(text);
              break;
            case 'use':
              this.useContent(text);
              break;
            case 'post':
              if (this.currentTab === 'thread') {
                this.postThread();
              }
              break;
          }
        });
      });

      return assistantMessage;
    }

    bindGenerateEvents() {
      const input = document.getElementById("generateInput");
      const btn = document.getElementById("generateBtn");

      input.addEventListener("input", (e) => {
        btn.disabled = e.target.value.trim().length === 0;
      });

      btn.addEventListener("click", () => {
        this.generateTweet();
      });
    }

    bindRewriteEvents() {
      const input = document.getElementById("rewriteInput");
      const charCount = document.getElementById("rewriteCharCount");
      const btn = document.getElementById("rewriteBtn");

      input.addEventListener("input", (e) => {
        const length = e.target.value.length;
        charCount.textContent = length;
        btn.disabled = length === 0;

        if (length > 280) {
          charCount.style.color = "#ef4444";
        } else {
          charCount.style.color = "#6b7280";
        }
      });

      btn.addEventListener("click", () => {
        this.rewriteContent();
      });
    }

    bindThreadEvents() {
      const input = document.getElementById("threadInput");
      const btn = document.getElementById("threadBtn");

      input.addEventListener("input", (e) => {
        btn.disabled = e.target.value.trim().length === 0;
      });

      btn.addEventListener("click", () => {
        this.generateThread();
      });

      // Post thread button (will be added dynamically)
      document.addEventListener("click", (e) => {
        if (e.target.id === "postThreadBtn") {
          this.postThread();
        }
      });
    }

    bindAgentEvents() {
      const keywordsInput = document.getElementById("agentKeywords");
      const toneSelect = document.getElementById("agentTone");
      const agentToggle = document.getElementById("agentToggle");

      // Load current settings only if elements exist
      if (keywordsInput) {
        keywordsInput.value = this.settings.keywords.join(", ");
        keywordsInput.addEventListener("input", (e) => {
          this.settings.keywords = e.target.value
            .split(",")
            .map((k) => k.trim())
            .filter((k) => k.length > 0);
          this.saveSettings();
        });
      }

      if (toneSelect) {
        toneSelect.value = this.settings.tone;
        toneSelect.addEventListener("change", (e) => {
          this.settings.tone = this.validateTone(e.target.value);
          this.saveSettings();
        });
      }

      if (agentToggle) {
        agentToggle.checked = this.settings.isActive;
        agentToggle.addEventListener("change", (e) => {
          this.toggleAgent(e.target.checked);
        });
      }

      // Auto-bot toggle
      const autoBotToggle = document.getElementById("autoBotToggle");
      if (autoBotToggle) {
        autoBotToggle.checked = this.settings.autoBotActive || false;
        autoBotToggle.addEventListener("change", (e) => {
          this.toggleAutoBot(e.target.checked);
        });
      }
    }

    bindReplyEvents() {
      // Copy reply button
      const copyReplyBtn = document.getElementById("copyReplyBtn");
      if (copyReplyBtn) {
        copyReplyBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const replyText = document.getElementById("replyText")?.textContent;
          if (replyText) {
            this.copyToClipboard(replyText);
          }
        });
      }
    }

    bindBatchEvents() {
      // Auto-monitoring toggle
      const autoMonitoringToggle = document.getElementById("autoMonitoringToggle");
      if (autoMonitoringToggle) {
        autoMonitoringToggle.addEventListener("change", (e) => {
          this.toggleAutoMonitoring(e.target.checked);
        });
      }

      // Refresh scan button
      const refreshScanBtn = document.getElementById("refreshScanBtn");
      if (refreshScanBtn) {
        refreshScanBtn.addEventListener("click", () => {
          this.refreshOpportunities();
        });
      }

      // Batch control buttons
      const selectAllBtn = document.getElementById("selectAllBtn");
      if (selectAllBtn) {
        selectAllBtn.addEventListener("click", () => {
          this.selectAllOpportunities(true);
        });
      }

      const clearAllBtn = document.getElementById("clearAllBtn");
      if (clearAllBtn) {
        clearAllBtn.addEventListener("click", async () => {
          await this.clearAllOpportunities();
        });
      }

      // Batch action buttons
      const copySelectedBtn = document.getElementById("copySelectedBtn");
      if (copySelectedBtn) {
        copySelectedBtn.addEventListener("click", () => {
          this.copySelectedOpportunities();
        });
      }
    }

    bindSettingsEvents() {
      const apiKeyInput = document.getElementById("settingsApiKey");
      const keywordsInput = document.getElementById("settingsKeywords");
      const updateBtn = document.getElementById("updateApiKeyBtn");
      const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");
      const cancelApiKeyBtn = document.getElementById("cancelApiKeyBtn");
      const saveBtn = document.getElementById("saveSettingsBtn");
      const apiKeyInputGroup = document.getElementById("apiKeyInputGroup");

      // Load current settings
      keywordsInput.value = this.settings.keywords.join(", ");

      // Set tone radio buttons
      const toneRadio = document.querySelector(
        `input[name="settingsTone"][value="${this.settings.tone}"]`
      );
      if (toneRadio) toneRadio.checked = true;

      // API Key edit flow
      updateBtn.addEventListener("click", () => {
        apiKeyInputGroup.style.display = "block";
        apiKeyInput.value = "";
        apiKeyInput.focus();
      });

      cancelApiKeyBtn.addEventListener("click", () => {
        apiKeyInputGroup.style.display = "none";
        apiKeyInput.value = "";
      });

      saveApiKeyBtn.addEventListener("click", () => {
        this.updateApiKey();
      });

      saveBtn.addEventListener("click", () => {
        this.saveSettingsFromModal();
      });
    }

    switchTab(tabName) {
      // Update dropdown selection
      const actionSelect = document.getElementById('actionSelect');
      if (actionSelect) {
        actionSelect.value = tabName;
      }

      // Always show chat interface (no more special sections)
      const chatContainer = document.querySelector('.chat-container');
      const batchSection = document.getElementById('batchOpportunities');
      const replySection = document.getElementById('replySection');
      
      // Hide all special sections
      if (batchSection) batchSection.style.display = 'none';
      if (replySection) replySection.style.display = 'none';
      if (chatContainer) chatContainer.style.display = 'flex';
      
      // Update placeholder text based on selection
      const input = document.getElementById('contentInput');
      if (input) {
        switch (tabName) {
          case 'generate':
            input.placeholder = '✨ Describe your idea or topic...';
            break;
          case 'rewrite':
            input.placeholder = '✏️ Paste your content here to rewrite...';
            break;
          case 'thread':
            input.placeholder = '📝 What topic should I create a thread about?';
            break;
          default:
            input.placeholder = '✨ Describe your idea or topic...';
        }
      }

      this.currentTab = tabName;
    }

    async generateTweet() {
      const input = document.getElementById("generateInput");
      const tone = this.validateTone(document.getElementById("generateTone").value);
      const btn = document.getElementById("generateBtn");
      const results = document.getElementById("generateResults");

      if (!input.value.trim()) {
        this.showToast("Please enter a prompt for the tweet", "error");
        return;
      }

      if (!this.settings.selectedBrandId || this.settings.selectedBrandId === "undefined") {
        this.showToast("Please select a brand space in settings first", "error");
        this.openSettings();
        return;
      }

      this.showLoading(btn, "Generating...");

      try {
        const response = await fetch(
          "https://www.xthreads.app/api/generate-tweet",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.settings.apiKey,
            },
            body: JSON.stringify({
              prompt: input.value.trim(),
              brandId: this.settings.selectedBrandId,
              tone: tone,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        const tweet = this.validateAndTruncateContent(data.tweet);

        // Save to history
        await this.addToHistory('tweet', tweet);

        await this.displayGeneratedContent([tweet], "generateVariations");
        results.style.display = "block";
      } catch (error) {
        console.error("Failed to generate tweet:", error);
        this.showToast("Failed to generate tweet. Please try again.", "error");
      } finally {
        this.resetButton(
          btn,
          "Generate Tweet",
          `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5,3 19,12 5,21"/>
        </svg>
        Generate Tweet
      `
        );
      }
    }

    async rewriteContent() {
      const input = document.getElementById("rewriteInput");
      const tone = this.validateTone(document.getElementById("rewriteTone").value);
      const btn = document.getElementById("rewriteBtn");
      const results = document.getElementById("rewriteResults");

      if (!input.value.trim()) {
        this.showToast("Please enter content to rewrite", "error");
        return;
      }

      if (!this.settings.selectedBrandId || this.settings.selectedBrandId === "undefined") {
        this.showToast("Please select a brand space in settings first", "error");
        this.openSettings();
        return;
      }

      this.showLoading(btn, "Rewriting...");

      try {
        const response = await fetch(
          "https://www.xthreads.app/api/rewrite-content",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.settings.apiKey,
            },
            body: JSON.stringify({
              originalContent: input.value.trim(),
              brandId: this.settings.selectedBrandId,
              tone: tone,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        // Handle both string and array responses
        let variations = [];
        if (Array.isArray(data.rewrittenContent)) {
          variations = data.rewrittenContent;
        } else if (data.rewrittenContent) {
          variations = [data.rewrittenContent];
        }
        const validatedVariations = variations.map((v) =>
          this.validateAndTruncateContent(v)
        );

        // Save to history
        await this.addToHistory('rewrite', validatedVariations[0]);

        await this.displayGeneratedContent(validatedVariations, "rewriteVariations");
        results.style.display = "block";
      } catch (error) {
        console.error("Failed to rewrite content:", error);
        this.showToast("Failed to rewrite content. Please try again.", "error");
      } finally {
        this.resetButton(
          btn,
          "Rewrite",
          `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        Rewrite
      `
        );
      }
    }

    async generateThreadUnified(userInput) {
      const tone = this.validateTone(document.getElementById("toneSelect").value);

      if (!userInput || !userInput.trim()) {
        this.showToast("Please enter content for the thread", "error");
        return;
      }

      if (!this.settings.selectedBrandId || this.settings.selectedBrandId === "undefined") {
        this.showToast("Please select a brand space in settings first", "error");
        this.openSettings();
        return;
      }

      try {
        const response = await fetch(
          "https://www.xthreads.app/api/generate-thread",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.settings.apiKey,
            },
            body: JSON.stringify({
              prompt: userInput.trim(),
              brandId: this.settings.selectedBrandId,
              tone: tone,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        const thread = data.thread || [];
        const validatedThread = thread.map((tweet) =>
          this.validateAndTruncateContent(tweet)
        );

        this.currentThread = validatedThread;
        
        // Save to history
        await this.addToHistory('thread', validatedThread);

        // Display thread using the old numbered format in conversation
        await this.displayThreadInConversation(validatedThread);

      } catch (error) {
        console.error("Failed to generate thread:", error);
        this.showToast("Failed to generate thread. Please try again.", "error");
      }
    }

    async displayThreadInConversation(thread) {
      const messagesContainer = document.getElementById("messagesContainer");
      
      // Create container for all thread tweets
      const threadContainer = document.createElement("div");
      threadContainer.className = "message-bubble assistant";
      
      let threadContent = '<div class="message-content">';
      
      for (let index = 0; index < thread.length; index++) {
        const tweet = thread[index];
        const tweetId = `tweet-${Date.now()}-${index}`;
        
        threadContent += `
          <div class="thread-tweet" style="margin-bottom: 16px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb;">
            <div class="thread-tweet-header" style="margin-bottom: 8px;">
              <span class="thread-tweet-number" style="color: #14b8a6; font-weight: 600; font-size: 14px;">Tweet ${index + 1}:</span>
            </div>
            <div class="thread-tweet-text" style="color: #374151; line-height: 1.5; margin-bottom: 12px;">${this.escapeHtml(tweet)}</div>
            <div class="thread-tweet-actions">
              <button class="action-btn-small" onclick="window.xThreadsApp.copyToClipboard('${this.escapeHtml(this.formatTweetText(tweet))}'); window.xThreadsApp.showToast('Tweet ${index + 1} copied!', 'success');" style="font-size: 12px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy
              </button>
            </div>
          </div>
        `;
      }
      
      threadContent += '</div>';
      threadContainer.innerHTML = threadContent;
      
      messagesContainer.appendChild(threadContainer);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      
      // Store in conversation history
      await this.saveConversationMessage({
        type: 'assistant',
        content: thread.map((tweet, index) => `Tweet ${index + 1}: ${tweet}`).join('\n\n'),
        timestamp: Date.now()
      });
      
      // Make app instance available globally for button clicks
      window.xThreadsApp = this;
    }

    async generateThread() {
      const input = document.getElementById("threadInput");
      const tone = this.validateTone(document.getElementById("threadTone").value);
      const btn = document.getElementById("threadBtn");
      const results = document.getElementById("threadResults");

      if (!input.value.trim()) {
        this.showToast("Please enter content for the thread", "error");
        return;
      }

      if (!this.settings.selectedBrandId || this.settings.selectedBrandId === "undefined") {
        this.showToast("Please select a brand space in settings first", "error");
        this.openSettings();
        return;
      }

      this.showLoading(btn, "Generating...");

      try {
        const response = await fetch(
          "https://www.xthreads.app/api/generate-thread",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.settings.apiKey,
            },
            body: JSON.stringify({
              prompt: input.value.trim(),
              brandId: this.settings.selectedBrandId,
              tone: tone,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        const thread = data.thread || [];
        const validatedThread = thread.map((tweet) =>
          this.validateAndTruncateContent(tweet)
        );

        this.currentThread = validatedThread;
        
        // Save to history
        await this.addToHistory('thread', validatedThread);

        await this.displayThread(validatedThread);
        results.style.display = "block";
      } catch (error) {
        console.error("Failed to generate thread:", error);
        this.showToast("Failed to generate thread. Please try again.", "error");
      } finally {
        this.resetButton(
          btn,
          "Generate Thread",
          `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
        </svg>
        Generate Thread
      `
        );
      }
    }

    async toggleAgent(isActive) {
      this.settings.isActive = isActive;
      await this.saveSettings();

      try {
        if (isActive) {
          // Clear old replies when starting agent
          console.log('🧹 Clearing old replies and starting fresh scan...');
          await chrome.storage.local.set({ xthreads_batch_opportunities: [] });
          this.displayBatchOpportunities([]);
          this.updateBatchBadge(0);
        }
        
        // Get current X.com tabs
        const tabs = await chrome.tabs.query({
          url: ["https://x.com/*", "https://twitter.com/*"],
        });

        const message = {
          action: isActive ? "startAgent" : "stopAgent",
          settings: this.settings,
          manualStop: !isActive // Flag to indicate this was a manual turn-off
        };

        // Send message to all X.com tabs
        for (const tab of tabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, message);
          } catch (error) {
            console.log("Could not send message to tab:", tab.id);
          }
        }

        this.updateAgentUI();
        
        if (isActive) {
          this.showToast("Agent started - scanning for opportunities...", "success");
        } else {
          // Don't show toast for manual turn-off - agent will handle completion message
          console.log('🛑 Manual agent turn-off initiated');
        }
      } catch (error) {
        console.error("Failed to toggle agent:", error);
        this.showToast("Failed to toggle agent", "error");

        // Revert toggle state
        document.getElementById("agentToggle").checked = !isActive;
        this.settings.isActive = !isActive;
      }
    }

    async toggleAutoBot(isActive) {
      this.settings.autoBotActive = isActive;
      await this.saveSettings();

      try {
        // Get current X.com tabs
        const tabs = await chrome.tabs.query({
          url: ["https://x.com/*", "https://twitter.com/*"],
        });

        const message = {
          action: isActive ? "startAutoBot" : "stopAutoBot",
          settings: this.settings,
        };

        // Send message to all X.com tabs
        for (const tab of tabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, message);
          } catch (error) {
            console.log("Could not send message to tab:", tab.id);
          }
        }

        this.updateAutoBotUI();
        
        if (isActive) {
          this.showToast("Auto-Reply Bot started! Navigate to For You page.", "success");
        } else {
          this.showToast("Auto-Reply Bot stopped.", "info");
        }
      } catch (error) {
        console.error("Failed to toggle auto-bot:", error);
        this.showToast("Failed to toggle auto-bot", "error");

        // Revert toggle state
        document.getElementById("autoBotToggle").checked = !isActive;
        this.settings.autoBotActive = !isActive;
      }
    }

    validateAndTruncateContent(content) {
      if (!content) return "";

      let cleaned = content.trim();

      if (cleaned.length > 280) {
        cleaned = cleaned.substring(0, 277) + "...";
        this.showToast("Content truncated to 280 characters", "info");
      }

      return cleaned;
    }

    async displayGeneratedContent(variations, containerId) {
      // For new chat interface, add as assistant messages
      for (const variation of variations) {
        const actions = [
          {
            type: 'copy',
            label: 'Copy',
            text: this.formatTweetText(variation),
            icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"/>
            </svg>`
          }
        ];
        
        await this.addAssistantMessage(variation, actions);
      }
      
      // Also await all the promises if using forEach would be converted to for...of
      // variations.forEach((variation, index) => {

      // Also maintain backward compatibility with old container system
      const container = document.getElementById(containerId);
      if (container) {
        container.innerHTML = "";

        variations.forEach((variation, index) => {
          const item = document.createElement("div");
          item.className = "result-item";
          item.innerHTML = `
            <div class="result-text">${variation}</div>
            <div class="result-actions">
              <button class="copy-btn" data-text="${this.escapeHtml(variation)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy
              </button>
            </div>
          `;
          container.appendChild(item);
        });

        // Bind copy buttons
        container.querySelectorAll(".copy-btn").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.copyToClipboard(btn.dataset.text);
          });
        });
      }
    }

    async displayThread(thread) {
      // For new chat interface, display each thread tweet separately with individual copy buttons
      for (let index = 0; index < thread.length; index++) {
        const tweet = thread[index];
        const actions = [
          {
            type: 'copy',
            label: 'Copy',
            text: this.formatTweetText(tweet),
            icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>`
          }
        ];
        
        await this.addAssistantMessage(tweet, actions);
      }
      
      // Note: Individual tweets are displayed above with their own copy buttons

      // Also maintain backward compatibility
      const container = document.getElementById("threadPreview");
      if (container) {
        container.innerHTML = "";

        thread.forEach((tweet, index) => {
          const item = document.createElement("div");
          item.className = "thread-tweet";
          item.innerHTML = `
            <div class="thread-tweet-header">
              <span class="thread-tweet-number">Tweet ${index + 1}:</span>
            </div>
            <div class="thread-tweet-text">${tweet}</div>
            <div class="thread-tweet-actions">
              <button class="copy-btn" data-tweet="${this.escapeHtml(tweet)}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy
              </button>
            </div>
          `;
          container.appendChild(item);
        });
        
        // Bind individual copy buttons
        container.querySelectorAll(".copy-btn").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.copyToClipboard(btn.dataset.tweet);
          });
        });
      }
    }

    async useContent(text) {
      try {
        console.log("Looking for X.com tabs...");
        
        // First try to get active X.com tab in current window
        let tabs = await chrome.tabs.query({
          url: ["https://x.com/*", "https://twitter.com/*"],
          active: true,
          currentWindow: true
        });
        
        console.log("Active X.com tabs in current window:", tabs);

        let targetTab;
        if (tabs.length > 0) {
          targetTab = tabs[0];
          console.log("Found active X.com tab:", targetTab.url);
        } else {
          // Check if any X.com tab exists in current window
          tabs = await chrome.tabs.query({
            url: ["https://x.com/*", "https://twitter.com/*"],
            currentWindow: true
          });
          
          console.log("All X.com tabs in current window:", tabs);
          
          if (tabs.length > 0) {
            targetTab = tabs[0];
            console.log("Found X.com tab, switching to it:", targetTab.url);
            await chrome.tabs.update(targetTab.id, { active: true });
          } else {
            // Check all windows
            tabs = await chrome.tabs.query({
              url: ["https://x.com/*", "https://twitter.com/*"]
            });
            
            console.log("All X.com tabs in all windows:", tabs);
            
            if (tabs.length > 0) {
              targetTab = tabs[0];
              console.log("Found X.com tab in another window, switching to it:", targetTab.url);
              await chrome.tabs.update(targetTab.id, { active: true });
              await chrome.windows.update(targetTab.windowId, { focused: true });
            } else {
              this.showToast("Please open X.com in a tab first", "error");
              return;
            }
          }
        }

        console.log("Sending message to tab:", targetTab.id);
        
        // Send message to content script to type the text
        await chrome.tabs.sendMessage(targetTab.id, {
          action: "typeInComposer",
          text: text,
        });

        this.showToast("Content inserted into composer!", "success");
        // Keep popup open for user convenience
        // window.close();
      } catch (error) {
        console.error("Failed to use content:", error);
        console.error("Error details:", error.message);
        this.showToast(`Error: ${error.message}`, "error");
      }
    }

    async postThread() {
      if (!this.currentThread || this.currentThread.length === 0) {
        this.showToast("No thread to post", "error");
        return;
      }

      try {
        // Use the same robust tab detection as useContent
        let tabs = await chrome.tabs.query({
          url: ["https://x.com/*", "https://twitter.com/*"],
          active: true,
          currentWindow: true
        });

        let targetTab;
        if (tabs.length > 0) {
          targetTab = tabs[0];
        } else {
          tabs = await chrome.tabs.query({
            url: ["https://x.com/*", "https://twitter.com/*"],
            currentWindow: true
          });
          
          if (tabs.length > 0) {
            targetTab = tabs[0];
            await chrome.tabs.update(targetTab.id, { active: true });
          } else {
            tabs = await chrome.tabs.query({
              url: ["https://x.com/*", "https://twitter.com/*"]
            });
            
            if (tabs.length > 0) {
              targetTab = tabs[0];
              await chrome.tabs.update(targetTab.id, { active: true });
              await chrome.windows.update(targetTab.windowId, { focused: true });
            } else {
              this.showToast("Please open X.com in a tab first", "error");
              return;
            }
          }
        }

        // Send message to content script to post the thread
        await chrome.tabs.sendMessage(targetTab.id, {
          action: "postThread",
          thread: this.currentThread,
        });

        this.showToast("Thread inserted! Ready to post.", "success");
        // Keep popup open for user convenience
        // window.close();
      } catch (error) {
        console.error("Failed to post thread:", error);
        this.showToast("Please open X.com and try again", "error");
      }
    }

    async updateApiKey() {
      const apiKeyInput = document.getElementById("settingsApiKey");
      const newApiKey = apiKeyInput.value.trim();

      if (!newApiKey) {
        this.showToast("Please enter an API key", "error");
        return;
      }

      try {
        // Validate the API key
        const response = await fetch(
          "https://www.xthreads.app/api/validate-key",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              apiKey: newApiKey,
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.valid) {
            this.settings.apiKey = newApiKey;
            await this.saveSettings();
            this.updateApiKeyDisplay();
            document.getElementById("apiKeyInputGroup").style.display = "none";
            document.getElementById("settingsApiKey").value = "";
            await this.loadBrandSpaces();
            this.showToast("API key updated successfully!", "success");
          } else {
            throw new Error("Invalid API key");
          }
        } else {
          throw new Error("API validation failed");
        }
      } catch (error) {
        console.error("Failed to update API key:", error);
        this.showToast("Invalid API key", "error");
      }
    }

    async saveSettingsFromModal() {
      const brandSpaceSelect = document.getElementById("settingsBrandSpace");
      const keywordsInput = document.getElementById("settingsKeywords");
      const toneRadio = document.querySelector(
        'input[name="settingsTone"]:checked'
      );

      // Update settings
      this.settings.selectedBrandId = brandSpaceSelect.value;
      this.settings.keywords = keywordsInput.value
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      if (toneRadio) {
        this.settings.tone = this.validateTone(toneRadio.value);
      }

      console.log("Saving settings:", this.settings);
      console.log("Selected brand ID:", this.settings.selectedBrandId);
      
      await this.saveSettings();
      this.updateBrandSpaceSelectors();
      this.closeSettings();
      this.showToast("Settings saved!", "success");
    }

    updateUI() {
      this.updateAgentUI();
      this.updateMonitoringUI();
      this.updateAutoBotUI();
    }

    updateAgentUI() {
      const statusDot = document.getElementById("statusDot");
      const statusText = document.getElementById("statusText");
      const agentStatusDot = document.getElementById("agentStatusDot");
      const agentStatusText = document.getElementById("agentStatusText");

      if (this.settings.isActive) {
        statusDot?.classList.add("active");
        agentStatusDot?.classList.add("active");
        if (statusText) statusText.textContent = "Active";
        if (agentStatusText) agentStatusText.textContent = "Active";
      } else {
        statusDot?.classList.remove("active");
        agentStatusDot?.classList.remove("active");
        if (statusText) statusText.textContent = "Inactive";
        if (agentStatusText) agentStatusText.textContent = "Inactive";
      }
    }

    updateMonitoringUI() {
      const autoMonitoringToggle = document.getElementById("autoMonitoringToggle");
      const monitoringState = document.getElementById("monitoringState");
      
      if (autoMonitoringToggle) {
        autoMonitoringToggle.checked = this.settings.isActive;
      }
      
      if (monitoringState) {
        monitoringState.textContent = this.settings.isActive ? 'ON' : 'OFF';
        monitoringState.classList.toggle('active', this.settings.isActive);
      }
    }

    updateAutoBotUI() {
      const autoBotStatusDot = document.getElementById("autoBotStatusDot");
      const autoBotStatusText = document.getElementById("autoBotStatusText");
      
      if (this.settings.autoBotActive) {
        autoBotStatusDot?.classList.add("active");
        if (autoBotStatusText) autoBotStatusText.textContent = "Running";
      } else {
        autoBotStatusDot?.classList.remove("active");
        if (autoBotStatusText) autoBotStatusText.textContent = "Stopped";
      }
    }

    updateStats() {
      const repliesCount = document.getElementById("repliesCount");
      const successRate = document.getElementById("successRate");

      if (repliesCount) repliesCount.textContent = this.stats.repliesCount;

      if (successRate) {
        const rate =
          this.stats.totalAttempts > 0
            ? Math.round(
                (this.stats.successCount / this.stats.totalAttempts) * 100
              )
            : 0;
        successRate.textContent = `${rate}%`;
      }
    }

    async openSettings() {
      this.updateApiKeyDisplay();
      
      // Show modal first
      document.getElementById("settingsModal").style.display = "flex";
      
      // Small delay to ensure DOM is ready
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Ensure brand spaces are loaded when opening settings
      if (this.settings.apiKey && this.brandSpaces.length === 0) {
        console.log('Loading brand spaces for settings modal...');
        await this.loadBrandSpaces();
      } else {
        // Update the selector even if brand spaces are already loaded
        this.updateBrandSpaceSelectors();
      }
      
      this.loadSettingsIntoModal();
    }

    closeSettings() {
      document.getElementById("settingsModal").style.display = "none";
    }

    loadSettingsIntoModal() {
      // Load brand space
      const brandSpaceSelect = document.getElementById('settingsBrandSpace');
      if (brandSpaceSelect) {
        console.log('Loading brand space into modal:', {
          selectedBrandId: this.settings.selectedBrandId,
          availableBrandSpaces: this.brandSpaces.length,
          selectOptions: brandSpaceSelect.options.length
        });
        
        if (this.settings.selectedBrandId) {
          brandSpaceSelect.value = this.settings.selectedBrandId;
          console.log('Set brand space value to:', brandSpaceSelect.value);
        }
      } else {
        console.error('Brand space select element not found!');
      }
      
      // Load tone setting
      const toneRadios = document.querySelectorAll('input[name="settingsTone"]');
      toneRadios.forEach(radio => {
        radio.checked = radio.value === this.settings.tone;
      });
      
      console.log('Loaded settings into modal:', {
        selectedBrandId: this.settings.selectedBrandId,
        tone: this.settings.tone,
        toneRadiosFound: toneRadios.length
      });
    }

    openHistoryModal() {
      const modal = document.getElementById('historyModal');
      if (modal) {
        console.log('🚀 Opening history modal...');
        this.loadHistoryModal();
        modal.style.display = 'flex';
      }
    }

    closeHistoryModal() {
      const modal = document.getElementById('historyModal');
      if (modal) {
        modal.style.display = 'none';
      }
    }

    switchHistoryTab(type) {
      // Update tab buttons
      document.querySelectorAll('.history-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.type === type);
      });
      
      // Update content sections
      document.querySelectorAll('.history-section').forEach(section => {
        section.classList.remove('active');
      });
      
      const targetSection = document.getElementById(type + 'History');
      if (targetSection) {
        targetSection.classList.add('active');
      }
      
      // Load content for this section
      this.loadHistorySection(type);
    }

    async loadHistoryContent() {
      // Load all history sections
      await this.loadHistorySection('generated');
      await this.loadHistorySection('rewritten');
      await this.loadHistorySection('threads');
    }

    async loadHistorySection(type) {
      try {
        const result = await chrome.storage.local.get('xthreads_content_history');
        const history = result.xthreads_content_history || { tweets: [], rewrites: [], threads: [] };
        
        let items = [];
        let sectionId = '';
        
        switch(type) {
          case 'generated':
            items = history.tweets || [];
            sectionId = 'generatedHistory';
            break;
          case 'rewritten':
            items = history.rewrites || [];
            sectionId = 'rewrittenHistory';
            break;
          case 'threads':
            items = history.threads || [];
            sectionId = 'threadsHistory';
            break;
        }
        
        const section = document.getElementById(sectionId);
        if (!section) return;
        
        if (items.length === 0) {
          // Show empty state (already in HTML)
          return;
        }
        
        // Clear empty state and show items
        section.innerHTML = items.map(item => `
          <div class="history-item">
            <div class="history-item-header">
              <span class="history-item-date">${new Date(item.timestamp).toLocaleDateString()}</span>
              <span class="history-item-tone">${item.tone || 'professional'}</span>
            </div>
            <div class="history-item-content">
              ${Array.isArray(item.content) ? item.content[0] : item.content}
            </div>
            <div class="history-item-actions">
              <button class="copy-btn" onclick="navigator.clipboard.writeText('${Array.isArray(item.content) ? item.content[0].replace(/'/g, "\\'"): item.content.replace(/'/g, "\\'")}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy
              </button>
              <button class="btn-small btn-secondary" onclick="xThreadsPopup.instance.useHistoryItem('${item.id}', '${type}')">
                Use
              </button>
            </div>
          </div>
        `).join('');
        
      } catch (error) {
        console.error('Failed to load history section:', error);
      }
    }

    async clearAllHistory() {
      if (!confirm('Are you sure you want to clear all history? This cannot be undone.')) {
        return;
      }
      
      try {
        await chrome.storage.local.set({
          xthreads_content_history: { tweets: [], rewrites: [], threads: [] }
        });
        
        this.loadHistoryContent();
        this.showToast('History cleared successfully', 'success');
      } catch (error) {
        console.error('Failed to clear history:', error);
        this.showToast('Failed to clear history', 'error');
      }
    }

    openHistoryModalOld() {
      // Old implementation - keeping for reference but unused
      // Create modal if it doesn't exist
      let modal = document.getElementById('historyModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'historyModal';
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-content">
            <div class="modal-header">
              <h2>Content History</h2>
              <button id="closeHistory" class="close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="history-container">
                <div class="history-section">
                  <div class="history-section-title">Generated Tweets</div>
                  <div class="history-list" id="historyTweets">
                    <div class="history-empty">No tweet history found</div>
                  </div>
                </div>
                
                <div class="history-section">
                  <div class="history-section-title">Rewritten Content</div>
                  <div class="history-list" id="historyRewrites">
                    <div class="history-empty">No rewrite history found</div>
                  </div>
                </div>
                
                <div class="history-section">
                  <div class="history-section-title">Thread Content</div>
                  <div class="history-list" id="historyThreads">
                    <div class="history-empty">No thread history found</div>
                  </div>
                </div>
                
                <div class="history-actions">
                  <button class="btn-secondary" id="clearHistoryBtn">Clear All History</button>
                </div>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        
        // Bind close events
        document.getElementById('closeHistory').addEventListener('click', () => {
          modal.style.display = 'none';
        });
        
        // Clear history button
        document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
          if (confirm('Are you sure you want to clear all history?')) {
            await chrome.storage.local.remove(['xthreads_history_tweet', 'xthreads_history_rewrite', 'xthreads_history_thread']);
            this.showToast('History cleared', 'success');
            this.loadHistoryModal();
          }
        });
        
        // Close on backdrop click
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            modal.style.display = 'none';
          }
        });
      }
      
      // Load and display history
      this.loadHistoryModal();
      modal.style.display = 'flex';
    }

    async loadHistoryModal() {
      try {
        console.log('📂 Loading history modal...');
        
        // Get recent tweets from 24-hour conversation history
        const recentTweets = await this.getRecentTweets();
        console.log(`📊 Recent tweets retrieved: ${recentTweets.length}`);
        
        // Get traditional history for rewrite and threads
        const result = await chrome.storage.local.get([
          'xthreads_history_rewrite', 
          'xthreads_history_thread'
        ]);
        
        // Display recent tweets in the Generated section
        const mappedTweets = recentTweets.map(tweet => ({
          id: tweet.id,
          content: tweet.content,
          timestamp: tweet.timestamp,
          type: 'tweet'
        }));
        
        console.log(`📋 Mapped tweets for display:`, mappedTweets);
        this.displayHistorySection('generatedHistory', mappedTweets, 'tweet');
        
        this.displayHistorySection('rewrittenHistory', result.xthreads_history_rewrite || [], 'rewrite');
        this.displayHistorySection('threadsHistory', result.xthreads_history_thread || [], 'thread');
        
      } catch (error) {
        console.error('Failed to load history:', error);
      }
    }

    displayHistorySection(containerId, items, type) {
      const container = document.getElementById(containerId);
      if (!container) return;
      
      if (items.length === 0) {
        container.innerHTML = '<div class="history-empty">No history found</div>';
        return;
      }
      
      container.innerHTML = '';
      items.forEach((item, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        const isThread = type === 'thread' && Array.isArray(item.content);
        const displayContent = isThread ? item.content[0] : item.content;
        const threadInfo = isThread ? `<div class="history-thread-count">${item.content.length} tweets</div>` : '';
        
        historyItem.innerHTML = `
          <div class="history-item-header">
            <div class="history-item-time">${this.formatTime(item.timestamp)}</div>
          </div>
          <div class="history-item-content ${isThread ? 'is-thread' : ''}">
            ${displayContent}
          </div>
          ${threadInfo}
          <div class="history-item-actions">
            <button class="history-copy-btn" data-content="${this.escapeHtml(isThread ? JSON.stringify(item.content) : item.content)}" data-type="${type}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy
            </button>
            <button class="history-delete-btn" data-index="${index}" data-type="${type}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3,6 5,6 21,6"></polyline>
                <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
              Delete
            </button>
          </div>
        `;
        
        container.appendChild(historyItem);
      });
      
      // Bind copy buttons
      container.querySelectorAll('.history-copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const content = btn.dataset.content;
          const type = btn.dataset.type;
          
          if (type === 'thread') {
            // For threads, copy all tweets
            try {
              const threadContent = JSON.parse(content);
              const fullThread = threadContent.join('\n\n');
              this.copyToClipboard(fullThread);
            } catch (e) {
              this.copyToClipboard(content);
            }
          } else {
            this.copyToClipboard(content);
          }
        });
      });
      
      // Bind delete buttons
      container.querySelectorAll('.history-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const index = parseInt(btn.dataset.index);
          const type = btn.dataset.type;
          await this.deleteHistoryItem(type, index);
          this.loadHistoryModal(); // Refresh display
        });
      });
    }

    async deleteHistoryItem(type, index) {
      try {
        if (type === 'tweet') {
          // Delete from conversation history
          const result = await chrome.storage.local.get('xthreads_conversation_history');
          const conversation = result.xthreads_conversation_history || [];
          
          // Find and remove the tweet at the specified index
          let tweetIndex = 0;
          let messageIndex = -1;
          
          for (let i = 0; i < conversation.length; i++) {
            if (conversation[i].type === 'assistant' && conversation[i].content && 
                (conversation[i].content.includes('Here are') || conversation[i].content.includes('tweet'))) {
              if (tweetIndex === index) {
                messageIndex = i;
                break;
              }
              tweetIndex++;
            }
          }
          
          if (messageIndex >= 0) {
            conversation.splice(messageIndex, 1);
            await chrome.storage.local.set({ xthreads_conversation_history: conversation });
          }
        } else {
          // Delete from regular history
          const storageKey = `xthreads_history_${type}`;
          const result = await chrome.storage.local.get(storageKey);
          const items = result[storageKey] || [];
          
          items.splice(index, 1);
          await chrome.storage.local.set({ [storageKey]: items });
        }
        
        this.showToast('Item deleted', 'success');
      } catch (error) {
        console.error('Failed to delete history item:', error);
        this.showToast('Failed to delete item', 'error');
      }
    }

    formatTime(timestamp) {
      const now = Date.now();
      const diff = now - timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      return `${days}d ago`;
    }

    async checkForTweetData() {
      try {
        const result = await chrome.storage.local.get('xthreads_current_tweet');
        if (result.xthreads_current_tweet) {
          const tweetData = result.xthreads_current_tweet;
          
          // Check if tweet data is recent (within last 30 seconds)
          const isRecent = (Date.now() - tweetData.timestamp) < 30000;
          
          if (isRecent) {
            // Switch to reply tab and load tweet context
            this.switchTab('reply');
            this.loadTweetContext(tweetData);
            
            // Clear the tweet data so it doesn't load again
            await chrome.storage.local.remove('xthreads_current_tweet');
          }
        }
      } catch (error) {
        console.error('Failed to check for tweet data:', error);
      }
    }

    loadTweetContext(tweetData) {
      // Show tweet context
      const tweetContext = document.getElementById('tweetContext');
      const tweetAuthor = document.getElementById('tweetAuthor');
      const tweetContent = document.getElementById('tweetContent');
      
      if (tweetContext && tweetAuthor && tweetContent) {
        // Extract author from URL or use placeholder
        const authorMatch = tweetData.url?.match(/twitter\.com\/([^\/]+)/) || tweetData.url?.match(/x\.com\/([^\/]+)/);
        const author = authorMatch ? `@${authorMatch[1]}` : 'Unknown Author';
        
        tweetAuthor.textContent = author;
        tweetContent.textContent = tweetData.content;
        tweetContext.style.display = 'block';
        
        // Hide empty state, show context
        const replyEmpty = document.getElementById('replyEmpty');
        if (replyEmpty) replyEmpty.style.display = 'none';
        
        // Store current tweet data for reply generation
        this.currentTweetData = tweetData;
        
        // Auto-generate reply
        this.generateAgenticReply();
      }
    }

    async generateAgenticReply() {
      if (!this.currentTweetData) return;
      
      // Validate settings
      if (!this.settings.selectedBrandId || this.settings.selectedBrandId === "undefined") {
        this.openSettings();
        return;
      }
      
      // Show loading state
      const replyLoading = document.getElementById('replyLoading');
      const replyResult = document.getElementById('replyResult');
      
      if (replyLoading) replyLoading.style.display = 'block';
      if (replyResult) replyResult.style.display = 'none';
      
      try {
        const response = await fetch('https://www.xthreads.app/api/ai-reply', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.settings.apiKey
          },
          body: JSON.stringify({
            parentTweetContent: this.currentTweetData.content,
            brandId: this.settings.selectedBrandId,
            tone: this.settings.tone || 'professional'
          })
        });
        
        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }
        
        const data = await response.json();
        const reply = data.reply || data.content;
        
        if (!reply) {
          throw new Error('No reply generated');
        }
        
        // Show result
        const replyText = document.getElementById('replyText');
        if (replyText) {
          replyText.textContent = reply;
        }
        
        if (replyLoading) replyLoading.style.display = 'none';
        if (replyResult) replyResult.style.display = 'block';
        
        // Bind copy button
        const copyReplyBtn = document.getElementById('copyReplyBtn');
        if (copyReplyBtn) {
          copyReplyBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.copyToClipboard(reply);
          };
        }
        
        this.showToast('Reply generated!', 'success');
        
      } catch (error) {
        console.error('Failed to generate reply:', error);
        if (replyLoading) replyLoading.style.display = 'none';
        this.showToast('Failed to generate reply. Please try again.', 'error');
      }
    }

    async checkForBatchOpportunities() {
      try {
        const result = await chrome.storage.local.get('xthreads_batch_opportunities');
        const opportunities = result.xthreads_batch_opportunities || [];
        
        console.log(`📱 Popup checking opportunities: found ${opportunities.length}`, opportunities);
        
        // Check if agent is still active (scanning)
        const isAgentActive = this.settings.isActive;
        
        // Check how many replies are still being generated (exclude "No reply" as that's complete)
        const generatingCount = opportunities.filter(
          opp => !opp.reply || opp.reply === null || opp.reply === 'Reply being generated...' || opp.reply === 'Generating...'
        ).length;
        
        // Only show loading if agent is active OR if we have opportunities but some replies are still generating
        if (isAgentActive || (opportunities.length > 0 && generatingCount > 0)) {
          // Show loading state instead of opportunities while scanning/generating
          this.showScanningState(opportunities.length, generatingCount, isAgentActive);
          
          // Auto-refresh to check for completion
          setTimeout(() => {
            this.checkForBatchOpportunities();
          }, 2000);
        } else if (opportunities.length > 0) {
          // Agent stopped and all replies ready - show opportunities
          this.displayBatchOpportunities(opportunities);
          
          // Show final toast notification if we haven't shown it yet
          this.showFinalToastIfReady(opportunities);
        } else {
          // No opportunities - show empty state
          this.displayBatchOpportunities([]);
        }
        
        // Store the count for badge updates
        this.batchOpportunityCount = opportunities.length;
        
        return opportunities;
      } catch (error) {
        console.error('Failed to check for batch opportunities:', error);
        return [];
      }
    }
    
    async showFinalToastIfReady(opportunities) {
      try {
        // Check if we've already shown the final toast for this batch
        const result = await chrome.storage.local.get('xthreads_final_toast_shown');
        const lastToastTime = result.xthreads_final_toast_shown || 0;
        
        // Only show toast once per batch (within 30 seconds)
        const shouldShowToast = (Date.now() - lastToastTime) > 30000;
        
        if (shouldShowToast && opportunities.length > 0) {
          // Check that all opportunities have replies (including "No reply")
          const readyCount = opportunities.filter(opp => opp.reply && 
            opp.reply !== null &&
            opp.reply !== 'Generating...' && 
            opp.reply !== 'Reply being generated...').length;
          
          if (readyCount === opportunities.length) {
            this.showToast(`${opportunities.length} opportunities ready with AI replies!`, 'success');
            // Mark toast as shown
            await chrome.storage.local.set({
              xthreads_final_toast_shown: Date.now()
            });
          }
        }
      } catch (error) {
        console.error('Failed to show final toast:', error);
      }
    }

    openBatchOpportunities() {
      // Switch to reply tab
      this.switchTab('reply');
      
      // Load and display batch opportunities (this will show persisted opportunities)
      this.checkForBatchOpportunities();
      
      // Clear the badge since user has opened the batch view and can see the opportunities
      this.updateBatchBadge(0);
    }

    // Badge functionality removed as requested

    async toggleAutoMonitoring(enabled) {
      this.settings.isActive = enabled;
      await this.saveSettings();
      
      // Update UI
      const monitoringState = document.getElementById('monitoringState');
      if (monitoringState) {
        monitoringState.textContent = enabled ? 'ON' : 'OFF';
        monitoringState.classList.toggle('active', enabled);
      }
      
      // Send message to content script
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url?.includes('x.com')) {
          chrome.tabs.sendMessage(tab.id, {
            action: enabled ? 'startAgent' : 'stopAgent',
            settings: this.settings
          });
        }
      } catch (error) {
        console.log('Content script not available');
      }
      
      this.showToast(`Auto-monitoring ${enabled ? 'enabled' : 'disabled'}`, 'success');
    }

    async refreshOpportunities() {
      const refreshBtn = document.getElementById('refreshScanBtn');
      const originalText = refreshBtn?.textContent;
      
      if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Scanning...';
      }
      
      try {
        // Send scan request to content script
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url?.includes('x.com')) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'scanForAgenticReplies',
            settings: this.settings
          });
          
          this.showToast('Scanning for opportunities...', 'info');
          
          // Check for results after a delay
          setTimeout(async () => {
            await this.checkForBatchOpportunities();
          }, 3000);
        } else {
          this.showToast('Please open X.com to scan for opportunities', 'error');
        }
      } catch (error) {
        console.error('Failed to refresh opportunities:', error);
        this.showToast('Failed to scan for opportunities', 'error');
      } finally {
        if (refreshBtn) {
          refreshBtn.disabled = false;
          refreshBtn.textContent = originalText;
        }
      }
    }

    showScanningState(foundCount, generatingCount, isAgentActive) {
      const batchOpportunities = document.getElementById('batchOpportunities');
      const replySection = document.getElementById('replySection');
      const opportunitiesList = document.getElementById('opportunitiesList');
      const batchTitle = document.getElementById('batchTitle');
      
      // Show batch section, hide reply section
      if (batchOpportunities) batchOpportunities.style.display = 'block';
      if (replySection) replySection.style.display = 'none';
      
      // Update title with scanning status
      if (batchTitle) {
        if (isAgentActive) {
          batchTitle.textContent = `Scanning for opportunities... (${foundCount} found)`;
        } else {
          batchTitle.textContent = `Generating replies... (${generatingCount} remaining)`;
        }
      }
      
      // Show loading state in opportunities list
      if (opportunitiesList) {
        const statusMessage = isAgentActive ? 
          'Scanning X.com for growth opportunities...' :
          `Generating AI replies for ${foundCount} opportunities...`;
        
        opportunitiesList.innerHTML = `
          <div class="scanning-state">
            <div class="spinner"></div>
            <p>${statusMessage}</p>
            ${foundCount > 0 ? `<small>${foundCount} opportunities found, please wait...</small>` : ''}
          </div>
        `;
      }
    }
    
    displayBatchOpportunities(opportunities) {
      console.log(`🎯 Displaying ${opportunities.length} opportunities in popup`);
      
      const batchOpportunities = document.getElementById('batchOpportunities');
      const replySection = document.getElementById('replySection');
      const batchTitle = document.getElementById('batchTitle');
      const opportunitiesList = document.getElementById('opportunitiesList');
      
      if (!opportunities || opportunities.length === 0) {
        console.log('📭 No opportunities to display, showing empty state');
        if (batchOpportunities) batchOpportunities.style.display = 'none';
        if (replySection) replySection.style.display = 'block';
        return;
      }
      
      console.log('📊 Showing batch opportunities UI with ready replies');
      // Show batch opportunities, hide single reply section
      if (batchOpportunities) batchOpportunities.style.display = 'block';
      if (replySection) replySection.style.display = 'none';
      
      // Update title
      if (batchTitle) {
        batchTitle.textContent = `Reply Opportunities (${opportunities.length}) - Ready!`;
      }
      
      // Clear and populate list
      if (opportunitiesList) {
        opportunitiesList.innerHTML = '';
        
        opportunities.forEach((opportunity, index) => {
          const item = this.createOpportunityItem(opportunity, index);
          opportunitiesList.appendChild(item);
        });
      }
      
      this.updateBatchControls();
    }

    createOpportunityItem(opportunity, index) {
      const item = document.createElement('div');
      item.className = 'opportunity-item';
      item.dataset.index = index;
      
      const author = this.extractAuthorFromUrl(opportunity.url) || 'Unknown';
      const timeAgo = this.formatTime(opportunity.timestamp || Date.now());
      
      // Check if reply is still being generated
      const isGenerating = !opportunity.reply || 
        opportunity.reply === null ||
        opportunity.reply === 'Reply being generated...' || 
        opportunity.reply === 'Generating...';
      
      const isNoReply = opportunity.reply === 'No reply';
      const isDisabled = isGenerating || isNoReply;
      
      let replyText, replyClass;
      if (isGenerating) {
        replyText = 'Generating reply...';
        replyClass = 'generating';
      } else if (isNoReply) {
        replyText = 'No reply available';
        replyClass = 'no-reply';
      } else {
        replyText = opportunity.reply;
        replyClass = '';
      }
      
      // Show viral indicator if available
      const viralIndicator = opportunity.isViral ? 
        `<span class="viral-indicator" title="High viral potential (weight: ${opportunity.weight?.toFixed(2) || 'N/A'})">🔥</span>` : '';
      
      // Clean the URL - remove /analytics if present and ensure it's the correct tweet URL
      const cleanUrl = opportunity.url.replace('/analytics', '').replace('/status/', '/status/');
      
      item.innerHTML = `
        <div class="opportunity-header">
          <input type="checkbox" class="opportunity-checkbox" data-index="${index}" ${isDisabled ? 'disabled' : ''}>
          <div class="opportunity-meta">
            <div class="opportunity-author">@${author} ${viralIndicator}</div>
            <div class="opportunity-time">${timeAgo}</div>
          </div>
        </div>
        <div class="opportunity-content">${opportunity.content}</div>
        <div class="opportunity-reply">
          <div class="opportunity-reply-label">Generated Reply:</div>
          <div class="opportunity-reply-text ${replyClass}">${replyText}</div>
        </div>
        <div class="opportunity-actions">
          <button class="opportunity-btn auto-reply" data-reply="${this.escapeHtml(opportunity.reply || '')}" data-url="${cleanUrl}" title="Auto-Reply to Tweet" ${isDisabled ? 'disabled' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
            Auto-Reply
          </button>
          <button class="opportunity-btn edit" data-index="${index}" title="Edit Reply" ${isDisabled ? 'disabled' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="opportunity-btn skip" data-index="${index}" title="Skip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      `;
      
      // Bind individual events
      this.bindOpportunityEvents(item);
      
      return item;
    }

    bindOpportunityEvents(item) {
      // Checkbox change
      const checkbox = item.querySelector('.opportunity-checkbox');
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          item.classList.toggle('selected', checkbox.checked);
          this.updateBatchControls();
        });
      }
      
      // Auto-reply button
      const autoReplyBtn = item.querySelector('.opportunity-btn.auto-reply');
      if (autoReplyBtn) {
        autoReplyBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const reply = autoReplyBtn.dataset.reply;
          const url = autoReplyBtn.dataset.url;
          
          console.log('🤖 Auto-Reply action - Reply:', reply?.substring(0, 30), 'URL:', url);
          
          if (reply && reply !== 'Generating...' && reply !== 'No reply') {
            try {
              // Send message to content script to handle auto-reply
              const success = await this.performAutoReply(url, reply);
              
              if (success) {
                this.showToast('Auto-reply sent successfully!', 'success');
                // Auto-progress to next opportunity
                await this.processAndRemoveOpportunity(parseInt(item.dataset.index), 'auto-replied');
              } else {
                // Fallback to copy & manual navigation
                await this.copyToClipboard(reply);
                await navigator.clipboard.writeText(url);
                this.showToast('Auto-reply failed. Reply & URL copied - please paste manually.', 'warning');
              }
              
            } catch (error) {
              console.error('❌ Failed auto-reply action:', error);
              // Fallback to copy
              await this.copyToClipboard(reply);
              this.showToast('Auto-reply failed. Reply copied - please paste manually.', 'error');
            }
          } else {
            this.showToast('No reply available', 'error');
          }
        });
      }
      
      // Edit button
      const editBtn = item.querySelector('.opportunity-btn.edit');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.editOpportunityReply(editBtn.dataset.index);
        });
      }
      
      // Skip button
      const skipBtn = item.querySelector('.opportunity-btn.skip');
      if (skipBtn) {
        skipBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.skipOpportunity(skipBtn.dataset.index);
        });
      }
    }

    selectAllOpportunities(select) {
      const checkboxes = document.querySelectorAll('.opportunity-checkbox');
      checkboxes.forEach(checkbox => {
        checkbox.checked = select;
        const item = checkbox.closest('.opportunity-item');
        if (item) {
          item.classList.toggle('selected', select);
        }
      });
      this.updateBatchControls();
    }

    updateBatchControls() {
      const selectedCount = document.querySelectorAll('.opportunity-checkbox:checked').length;
      const copySelectedBtn = document.getElementById('copySelectedBtn');
      
      if (copySelectedBtn) {
        copySelectedBtn.disabled = selectedCount === 0;
        copySelectedBtn.textContent = `Copy Selected (${selectedCount})`;
      }
    }

    async copySelectedOpportunities() {
      const selectedItems = document.querySelectorAll('.opportunity-item.selected');
      if (selectedItems.length === 0) {
        this.showToast('No opportunities selected', 'error');
        return;
      }
      
      let copyText = '';
      selectedItems.forEach((item, index) => {
        const openBtn = item.querySelector('.opportunity-btn.open');
        const copyBtn = item.querySelector('.opportunity-btn.copy');
        
        const url = openBtn?.dataset.url || '';
        const reply = copyBtn?.dataset.reply || '';
        
        copyText += `Tweet ${index + 1}: ${url}\nReply: ${reply}\n\n`;
      });
      
      await this.copyToClipboard(copyText.trim());
      this.showToast(`Copied ${selectedItems.length} opportunities`, 'success');
    }

    async clearAllOpportunities() {
      try {
        // Clear from storage
        await chrome.storage.local.set({ xthreads_batch_opportunities: [] });
        
        // Update UI
        this.updateBatchBadge(0);
        this.displayBatchOpportunities([]);
        
        this.showToast('All opportunities cleared', 'success');
      } catch (error) {
        console.error('Failed to clear opportunities:', error);
        this.showToast('Failed to clear opportunities', 'error');
      }
    }

    extractAuthorFromUrl(url) {
      if (!url) return null;
      const match = url.match(/(?:twitter\.com|x\.com)\/([^\/]+)/);
      return match ? match[1] : null;
    }

    editOpportunityReply(index) {
      // TODO: Implement reply editing modal
      this.showToast('Reply editing coming soon', 'info');
    }

    async skipOpportunity(index) {
      await this.processAndRemoveOpportunity(parseInt(index), 'skipped');
    }
    
    async processAndRemoveOpportunity(index, action) {
      console.log(`🔄 Processing opportunity ${index} - action: ${action}`);
      
      try {
        const result = await chrome.storage.local.get('xthreads_batch_opportunities');
        const opportunities = result.xthreads_batch_opportunities || [];
        
        if (index < 0 || index >= opportunities.length) {
          console.error('Invalid opportunity index:', index);
          return;
        }
        
        const processedOpportunity = opportunities[index];
        console.log(`📝 Removing opportunity: ${processedOpportunity.content.substring(0, 50)}...`);
        
        // Remove the processed opportunity from storage
        opportunities.splice(index, 1);
        await chrome.storage.local.set({ xthreads_batch_opportunities: opportunities });
        
        // Update UI immediately
        this.displayBatchOpportunities(opportunities);
        this.updateBatchBadge(opportunities.length);
        
        // Show appropriate message based on remaining opportunities
        if (opportunities.length === 0) {
          this.showToast('All opportunities processed! Agent scan complete.', 'success');
        } else {
          const actionMessage = {
            'copied': `Reply copied! ${opportunities.length} opportunities remaining`,
            'opened': `Tweet opened! ${opportunities.length} opportunities remaining`,
            'copied-and-opened': `Reply copied & tweet opened! ${opportunities.length} opportunities remaining`,
            'skipped': `Opportunity skipped! ${opportunities.length} opportunities remaining`
          };
          
          this.showToast(actionMessage[action] || `Processed! ${opportunities.length} remaining`, 'info');
        }
        
        // Auto-highlight the next opportunity (now at the same index since we removed current one)
        if (opportunities.length > 0) {
          setTimeout(() => {
            const nextIndex = Math.min(index, opportunities.length - 1);
            this.highlightOpportunity(nextIndex);
          }, 500);
        }
        
      } catch (error) {
        console.error('Failed to process opportunity:', error);
        this.showToast('Failed to process opportunity', 'error');
      }
    }
    
    highlightOpportunity(index) {
      try {
        const item = document.querySelector(`[data-index="${index}"]`);
        if (item) {
          // Add highlight class
          item.classList.add('next-opportunity');
          
          // Scroll into view smoothly
          item.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Remove highlight after 2 seconds
          setTimeout(() => {
            item.classList.remove('next-opportunity');
          }, 2000);
          
          console.log(`✨ Highlighted next opportunity at index ${index}`);
        }
      } catch (error) {
        console.error('Failed to highlight opportunity:', error);
      }
    }

    async performAutoReply(tweetUrl, reply) {
      try {
        console.log('🤖 Attempting auto-reply to:', tweetUrl);
        
        // Find X.com tabs
        const tabs = await chrome.tabs.query({
          url: ["https://x.com/*", "https://twitter.com/*"]
        });
        
        if (tabs.length === 0) {
          console.log('❌ No X.com tabs found');
          return false;
        }
        
        const targetTab = tabs[0];
        console.log('📱 Found X.com tab:', targetTab.id);
        
        // Send message to content script to handle auto-reply
        const response = await chrome.tabs.sendMessage(targetTab.id, {
          action: 'performAutoReply',
          tweetUrl: tweetUrl,
          reply: reply
        });
        
        console.log('🔄 Auto-reply response:', response);
        return response && response.success;
        
      } catch (error) {
        console.error('❌ Auto-reply failed:', error);
        return false;
      }
    }

    async storeActiveOpportunity(index) {
      try {
        const result = await chrome.storage.local.get('xthreads_batch_opportunities');
        const opportunities = result.xthreads_batch_opportunities || [];
        
        if (opportunities[index]) {
          // Store the selected opportunity for persistence across tab switches
          await chrome.storage.local.set({
            xthreads_active_opportunity: {
              ...opportunities[index],
              index: index,
              timestamp: Date.now()
            }
          });
          console.log('Stored active opportunity for persistence:', opportunities[index]);
        }
      } catch (error) {
        console.error('Failed to store active opportunity:', error);
      }
    }

    showLoading(button, text) {
      button.disabled = true;
      button.classList.add("loading");
      button.textContent = text;
    }

    resetButton(button, text, html) {
      button.disabled = false;
      button.classList.remove("loading");
      if (html) {
        button.innerHTML = html;
      } else {
        button.textContent = text;
      }
    }

    escapeHtml(text) {
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    formatTweetText(text) {
      if (!text) return "";
      
      // Add actual line breaks after periods followed by space and capitalize letter
      let formatted = text.replace(/\. ([A-Z])/g, '.\n\n$1');
      return formatted;
    }

    formatTweetTextForDisplay(text) {
      if (!text) return "";
      
      // First escape HTML entities, then add line breaks
      let escaped = this.escapeHtml(text);
      let formatted = escaped.replace(/\. ([A-Z])/g, '.<br><br>$1');
      return formatted;
    }

    // 24-Hour Conversation Storage System
    async saveConversationMessage(message) {
      try {
        console.log(`💾 Saving conversation message:`, message);
        const result = await chrome.storage.local.get('xthreads_conversation_history');
        let conversation = result.xthreads_conversation_history || [];
        
        // Add new message
        const messageWithId = {
          id: Date.now() + Math.random(),
          ...message
        };
        conversation.push(messageWithId);
        
        console.log(`📝 Message added to conversation. Total messages: ${conversation.length}`);
        
        // Clean up messages older than 24 hours
        const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
        conversation = conversation.filter(msg => msg.timestamp > twentyFourHoursAgo);
        
        await chrome.storage.local.set({
          xthreads_conversation_history: conversation
        });
        
        console.log(`✅ Conversation saved successfully. Messages after cleanup: ${conversation.length}`);
      } catch (error) {
        console.error('❌ Failed to save conversation message:', error);
      }
    }

    async loadConversationHistory() {
      try {
        const result = await chrome.storage.local.get('xthreads_conversation_history');
        const conversation = result.xthreads_conversation_history || [];
        
        // Clean up old messages (24+ hours)
        const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
        const validConversation = conversation.filter(msg => msg.timestamp > twentyFourHoursAgo);
        
        // Update storage with cleaned data
        if (validConversation.length !== conversation.length) {
          await chrome.storage.local.set({
            xthreads_conversation_history: validConversation
          });
        }
        
        return validConversation;
      } catch (error) {
        console.error('Failed to load conversation history:', error);
        return [];
      }
    }

    async restoreConversationHistory() {
      try {
        console.log('🔄 Attempting to restore conversation history...');
        const conversation = await this.loadConversationHistory();
        console.log(`📝 Found ${conversation.length} messages in history`);
        
        if (conversation.length === 0) return; // No conversation to restore
        
        const messagesContainer = document.getElementById("messagesContainer");
        
        // Check if we already have the correct number of messages to avoid duplicates
        const existingMessages = messagesContainer.querySelectorAll('.message-bubble');
        console.log(`💬 Current messages in UI: ${existingMessages.length}, History messages: ${conversation.length}`);
        
        if (existingMessages.length === conversation.length) {
          console.log('✅ Messages already displayed correctly');
          return;
        }
        
        // Hide welcome message
        const welcomeMessage = messagesContainer.querySelector(".welcome-message");
        if (welcomeMessage) {
          welcomeMessage.style.display = "none";
        }
        
        // Clear existing messages to avoid duplicates
        existingMessages.forEach(msg => msg.remove());
        
        // Restore messages
        for (const message of conversation) {
          if (message.type === 'user') {
            const userMessage = document.createElement("div");
            userMessage.className = "message-bubble user";
            userMessage.innerHTML = `
              <div class="message-content">
                <p>${this.escapeHtml(message.content)}</p>
              </div>
            `;
            messagesContainer.appendChild(userMessage);
          } else if (message.type === 'assistant') {
            const assistantMessage = document.createElement("div");
            assistantMessage.className = "message-bubble assistant";
            
            let actionsHtml = "";
            if (message.actions && message.actions.length > 0) {
              actionsHtml = `
                <div class="message-actions">
                  ${message.actions.map(action => `
                    <button class="action-btn-small" data-action="${action.type}" data-text="${this.escapeHtml(action.text || message.content)}">
                      ${action.icon}
                      ${action.label}
                    </button>
                  `).join('')}
                </div>
              `;
            }
            
            assistantMessage.innerHTML = `
              <div class="message-content">
                <p>${this.formatTweetTextForDisplay(message.content)}</p>
                ${actionsHtml}
              </div>
            `;
            
            messagesContainer.appendChild(assistantMessage);
            
            // Bind action buttons
            assistantMessage.querySelectorAll(".action-btn-small").forEach(btn => {
              btn.addEventListener("click", (e) => {
                const action = e.currentTarget.dataset.action;
                const text = e.currentTarget.dataset.text;
                this.handleMessageAction(action, text);
              });
            });
          }
        }
        
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        console.log('✅ Conversation history restored successfully');
        
      } catch (error) {
        console.error('❌ Failed to restore conversation history:', error);
      }
    }

    async getRecentTweets() {
      try {
        console.log('🔍 Getting recent tweets from conversation history...');
        const conversation = await this.loadConversationHistory();
        console.log(`📝 Conversation loaded: ${conversation.length} messages`);
        const tweets = [];
        
        for (const message of conversation) {
          console.log(`📨 Processing message: type=${message.type}, actions=${message.actions?.length || 0}`);
          if (message.type === 'assistant' && message.actions) {
            // Extract tweets from assistant messages with copy actions
            for (const action of message.actions) {
              console.log(`🔍 Checking action: type=${action.type}, hasText=${!!action.text}`);
              if (action.type === 'copy' && action.text) {
                tweets.push({
                  id: message.id,
                  content: action.text,
                  timestamp: message.timestamp,
                  originalMessage: message.content
                });
                console.log(`✅ Added tweet to recent list: ${action.text.substring(0, 50)}...`);
              }
            }
          }
        }
        
        console.log(`📊 Found ${tweets.length} recent tweets total`);
        
        // Sort by most recent first
        tweets.sort((a, b) => b.timestamp - a.timestamp);
        
        return tweets;
      } catch (error) {
        console.error('❌ Failed to get recent tweets:', error);
        return [];
      }
    }

    loadDefaultTone() {
      const toneSelect = document.getElementById("toneSelect");
      if (toneSelect && this.settings.tone) {
        toneSelect.value = this.settings.tone;
      }
    }

    updateApiKeyDisplay() {
      const display = document.getElementById("currentApiKeyDisplay");
      if (display) {
        if (this.settings.apiKey) {
          // Show first 8 characters + masked rest
          const maskedKey =
            this.settings.apiKey.substring(0, 8) + "••••••••••••••••";
          display.textContent = maskedKey;
          display.style.color = "#374151";
        } else {
          display.textContent = "Not set";
          display.style.color = "#9ca3af";
        }
      }
    }

    validateTone(tone) {
      const validTones = [
        "professional", "casual", "punchy", "educational", "inspirational", 
        "humorous", "empathetic", "encouraging", "authentic", "controversial", 
        "bold", "witty", "insightful", "analytical", "storytelling"
      ];
      
      if (!validTones.includes(tone)) {
        console.warn(`Invalid tone: ${tone}. Using default 'professional'`);
        return "professional";
      }
      
      return tone;
    }

    async restoreLastGenerated() {
      try {
        const result = await chrome.storage.local.get([
          'xthreads_last_tweet',
          'xthreads_last_rewrite', 
          'xthreads_last_thread'
        ]);
        
        // Only restore if generated within last 30 minutes
        const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
        
        // Restore tweet if available
        if (result.xthreads_last_tweet && result.xthreads_last_tweet.timestamp > thirtyMinutesAgo) {
          this.displayGeneratedContent(result.xthreads_last_tweet.content, "generateVariations");
          document.getElementById("generateResults").style.display = "block";
          console.log('Restored last generated tweet');
        }
        
        // Restore rewrite if available
        if (result.xthreads_last_rewrite && result.xthreads_last_rewrite.timestamp > thirtyMinutesAgo) {
          this.displayGeneratedContent(result.xthreads_last_rewrite.content, "rewriteVariations");
          document.getElementById("rewriteResults").style.display = "block";
          console.log('Restored last rewritten content');
        }
        
        // Restore thread if available
        if (result.xthreads_last_thread && result.xthreads_last_thread.timestamp > thirtyMinutesAgo) {
          this.currentThread = result.xthreads_last_thread.content;
          this.displayThread(result.xthreads_last_thread.content);
          document.getElementById("threadResults").style.display = "block";
          console.log('Restored last generated thread');
        }
        
        // Show toast if any content was restored
        const restoredCount = [
          result.xthreads_last_tweet?.timestamp > thirtyMinutesAgo,
          result.xthreads_last_rewrite?.timestamp > thirtyMinutesAgo,
          result.xthreads_last_thread?.timestamp > thirtyMinutesAgo
        ].filter(Boolean).length;
        
        if (restoredCount > 0) {
          this.showToast(`Restored ${restoredCount} previous generation(s)`, "info");
        }
        
      } catch (error) {
        console.error('Failed to restore last generated content:', error);
      }
    }

    async addToHistory(type, content) {
      try {
        const key = `xthreads_history_${type}`;
        const result = await chrome.storage.local.get(key);
        const history = result[key] || [];
        
        // Add new item to beginning of array
        history.unshift({
          content: content,
          timestamp: Date.now(),
          id: Date.now().toString()
        });
        
        // Keep only last 10 items
        const trimmedHistory = history.slice(0, 10);
        
        await chrome.storage.local.set({
          [key]: trimmedHistory
        });
        
        // Also save as last generated for auto-restore
        await chrome.storage.local.set({
          [`xthreads_last_${type}`]: {
            content: Array.isArray(content) ? content : [content],
            timestamp: Date.now()
          }
        });
        
        // Update history display if on history tab
        if (this.currentTab === 'history') {
          await this.loadHistory();
        }
        
      } catch (error) {
        console.error('Failed to add to history:', error);
      }
    }

    async loadHistory() {
      try {
        const result = await chrome.storage.local.get([
          'xthreads_history_tweet',
          'xthreads_history_rewrite',
          'xthreads_history_thread'
        ]);
        
        this.displayHistory('tweet', result.xthreads_history_tweet || []);
        this.displayHistory('rewrite', result.xthreads_history_rewrite || []);
        this.displayHistory('thread', result.xthreads_history_thread || []);
        
      } catch (error) {
        console.error('Failed to load history:', error);
      }
    }

    displayHistory(type, items) {
      const containerId = `history${type.charAt(0).toUpperCase() + type.slice(1)}sList`;
      const container = document.getElementById(containerId);
      
      if (!container) return;
      
      if (items.length === 0) {
        container.innerHTML = `<div class="history-empty">No ${type}s generated yet</div>`;
        return;
      }
      
      container.innerHTML = '';
      
      items.forEach((item, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        const timeAgo = this.getTimeAgo(item.timestamp);
        const preview = this.getContentPreview(item.content, type);
        
        historyItem.innerHTML = `
          <div class="history-item-header">
            <span class="history-item-time">${timeAgo}</span>
          </div>
          <div class="history-item-content ${type === 'thread' ? 'is-thread' : ''}">
            ${preview}
          </div>
          <div class="history-item-actions">
            <button class="history-copy-btn" data-type="${type}" data-id="${item.id}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy
            </button>
            <button class="history-use-btn" data-type="${type}" data-id="${item.id}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14m-7-7l7 7-7 7"/>
              </svg>
              Use
            </button>
            <button class="history-delete-btn" data-type="${type}" data-id="${item.id}">×</button>
          </div>
        `;
        
        container.appendChild(historyItem);
      });
    }

    getContentPreview(content, type) {
      if (type === 'thread' && Array.isArray(content)) {
        const preview = content[0].substring(0, 100) + (content[0].length > 100 ? '...' : '');
        return `
          <div class="history-item-preview">${preview}</div>
          <div class="history-thread-count">${content.length} tweets in thread</div>
        `;
      } else {
        const text = Array.isArray(content) ? content[0] : content;
        return text.substring(0, 120) + (text.length > 120 ? '...' : '');
      }
    }

    getTimeAgo(timestamp) {
      const now = Date.now();
      const diff = now - timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      return `${days}d ago`;
    }

    async useHistoryItem(type, id) {
      try {
        const key = `xthreads_history_${type}`;
        const result = await chrome.storage.local.get(key);
        const history = result[key] || [];
        
        const item = history.find(h => h.id === id);
        if (!item) return;
        
        if (type === 'thread') {
          this.currentThread = item.content;
          this.switchTab('thread');
          this.displayThread(item.content);
          document.getElementById("threadResults").style.display = "block";
        } else {
          const content = Array.isArray(item.content) ? item.content : [item.content];
          const tabName = type === 'tweet' ? 'generate' : 'rewrite';
          const containerId = type === 'tweet' ? 'generateVariations' : 'rewriteVariations';
          
          this.switchTab(tabName);
          this.displayGeneratedContent(content, containerId);
          document.getElementById(`${tabName}Results`).style.display = "block";
        }
        
        this.showToast(`Loaded ${type} from history`, 'success');
        
      } catch (error) {
        console.error('Failed to use history item:', error);
        this.showToast('Failed to load from history', 'error');
      }
    }

    async deleteHistoryItem(type, id) {
      try {
        const key = `xthreads_history_${type}`;
        const result = await chrome.storage.local.get(key);
        const history = result[key] || [];
        
        const filteredHistory = history.filter(h => h.id !== id);
        
        await chrome.storage.local.set({
          [key]: filteredHistory
        });
        
        this.displayHistory(type, filteredHistory);
        this.showToast('Deleted from history', 'info');
        
      } catch (error) {
        console.error('Failed to delete history item:', error);
        this.showToast('Failed to delete item', 'error');
      }
    }

    async clearAllHistory() {
      if (!confirm('Are you sure you want to clear all history?')) return;
      
      try {
        await chrome.storage.local.remove([
          'xthreads_history_tweet',
          'xthreads_history_rewrite',
          'xthreads_history_thread'
        ]);
        
        await this.loadHistory();
        this.showToast('History cleared', 'success');
        
      } catch (error) {
        console.error('Failed to clear history:', error);
        this.showToast('Failed to clear history', 'error');
      }
    }

    async copyToClipboard(text) {
      try {
        await navigator.clipboard.writeText(text);
        this.showToast("Copied to clipboard!", "success");
        return true;
      } catch (error) {
        console.error("Failed to copy:", error);
        // Fallback for older browsers
        try {
          const textArea = document.createElement("textarea");
          textArea.value = text;
          textArea.style.position = 'fixed';
          textArea.style.left = '-999999px';
          textArea.style.top = '-999999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          const result = document.execCommand("copy");
          document.body.removeChild(textArea);
          if (result) {
            this.showToast("Copied to clipboard!", "success");
            return true;
          } else {
            throw new Error("Copy command failed");
          }
        } catch (fallbackError) {
          console.error("Fallback copy failed:", fallbackError);
          this.showToast("Failed to copy to clipboard", "error");
          return false;
        }
      }
    }

    async copyThreadToClipboard(thread) {
      try {
        const threadText = thread.map((tweet, index) => `${index + 1}/${thread.length} ${tweet}`).join('\n\n');
        await this.copyToClipboard(threadText);
      } catch (error) {
        console.error("Failed to copy thread:", error);
        this.showToast("Failed to copy thread", "error");
      }
    }

    async copyHistoryItem(type, id) {
      try {
        const key = `xthreads_history_${type}`;
        const result = await chrome.storage.local.get(key);
        const history = result[key] || [];
        
        const item = history.find(h => h.id === id);
        if (!item) return;
        
        if (type === 'thread' && Array.isArray(item.content)) {
          await this.copyThreadToClipboard(item.content);
        } else {
          const text = Array.isArray(item.content) ? item.content[0] : item.content;
          await this.copyToClipboard(text);
        }
        
      } catch (error) {
        console.error('Failed to copy history item:', error);
        this.showToast('Failed to copy from history', 'error');
      }
    }

    handleAgentStopped(message) {
      console.log('🛑 Received agent stopped message:', message);
      
      // Update settings to reflect agent is now inactive
      this.settings.isActive = false;
      this.saveSettings();
      
      // Update UI toggles
      const agentToggle = document.getElementById("agentToggle");
      const autoMonitoringToggle = document.getElementById("autoMonitoringToggle");
      
      if (agentToggle) {
        agentToggle.checked = false;
        console.log('✅ Updated agent toggle to OFF');
      }
      
      if (autoMonitoringToggle) {
        autoMonitoringToggle.checked = false;
        console.log('✅ Updated auto-monitoring toggle to OFF');
      }
      
      // Update UI status indicators
      this.updateUI();
      
      // Show completion message
      const completionMessage = message.opportunitiesFound > 0 
        ? `Scan complete! Found ${message.opportunitiesFound} opportunities. Agent automatically stopped.`
        : 'Scan complete! No relevant opportunities found. Agent automatically stopped.';
      
      this.showToast(completionMessage, 'success');
      
      console.log('🔄 UI updated to reflect agent stopped state');
    }

    showToast(message, type = "info") {
      const container = document.getElementById("toastContainer");
      const toast = document.createElement("div");
      toast.className = `toast ${type}`;
      toast.textContent = message;

      container.appendChild(toast);

      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 4000);
    }

    async checkForRewriteData() {
      try {
        const result = await chrome.storage.local.get(['xthreads_rewrite_data', 'xthreads_open_rewrite_tab']);
        
        // Check if we should open rewrite tab (from background script flag)
        let shouldOpenRewriteTab = false;
        if (result.xthreads_open_rewrite_tab) {
          const isRecent = (Date.now() - result.xthreads_open_rewrite_tab.timestamp) < 30000;
          if (isRecent) {
            shouldOpenRewriteTab = true;
            // Clear the flag
            await chrome.storage.local.remove('xthreads_open_rewrite_tab');
          }
        }
        
        // Check if we have rewrite data
        if (result.xthreads_rewrite_data) {
          const rewriteData = result.xthreads_rewrite_data;
          
          // Check if rewrite data is recent (within last 5 minutes)
          const isRecent = (Date.now() - rewriteData.timestamp) < 300000; // 5 minutes
          
          if (isRecent) {
            // Switch to rewrite tab if flagged or if data is very recent
            const isVeryRecent = (Date.now() - rewriteData.timestamp) < 30000; // 30 seconds
            if (shouldOpenRewriteTab || isVeryRecent) {
              this.switchTab('rewrite');
            }
            
            // Load rewrite data
            this.loadRewriteData(rewriteData);
          } else {
            // Clear old rewrite data
            await chrome.storage.local.remove('xthreads_rewrite_data');
          }
        }
      } catch (error) {
        console.error('Failed to check for rewrite data:', error);
      }
    }

    async checkForActiveOpportunity() {
      try {
        const result = await chrome.storage.local.get('xthreads_active_opportunity');
        if (result.xthreads_active_opportunity) {
          const activeOpportunity = result.xthreads_active_opportunity;
          
          // Check if the stored opportunity is recent (within last 5 minutes)
          const isRecent = (Date.now() - activeOpportunity.timestamp) < 300000; // 5 minutes
          
          if (isRecent) {
            // Ensure we're on the reply tab
            this.switchTab('reply');
            
            // Highlight the active opportunity in the list
            this.highlightActiveOpportunity(activeOpportunity.index);
            
            console.log('Restored active opportunity from tab navigation:', activeOpportunity);
          } else {
            // Clean up old active opportunity data
            await chrome.storage.local.remove('xthreads_active_opportunity');
          }
        }
      } catch (error) {
        console.error('Failed to check for active opportunity:', error);
      }
    }

    highlightActiveOpportunity(index) {
      try {
        // Find the opportunity item and highlight it
        const item = document.querySelector(`[data-index="${index}"]`);
        if (item) {
          // Add highlight class
          item.classList.add('active-opportunity');
          
          // Scroll into view
          item.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Remove highlight after 3 seconds
          setTimeout(() => {
            item.classList.remove('active-opportunity');
          }, 3000);
        }
      } catch (error) {
        console.error('Failed to highlight active opportunity:', error);
      }
    }

    loadRewriteData(rewriteData) {
      try {
        // Fill the rewrite input with original content
        const rewriteInput = document.getElementById('rewriteInput');
        if (rewriteInput) {
          rewriteInput.value = rewriteData.originalContent;
          this.updateCharCount('rewriteCharCount', rewriteData.originalContent.length);
        }
        
        // Set the tone
        const rewriteTone = document.getElementById('rewriteTone');
        if (rewriteTone && rewriteData.tone) {
          rewriteTone.value = rewriteData.tone;
        }
        
        // Show the results
        const rewriteResults = document.getElementById('rewriteResults');
        const rewriteVariations = document.getElementById('rewriteVariations');
        
        if (rewriteResults && rewriteVariations) {
          rewriteVariations.innerHTML = `
            <div class="result-item">
              <div class="result-text">${this.escapeHtml(rewriteData.rewrittenContent)}</div>
              <div class="result-actions">
                <button class="copy-btn" data-text="${this.escapeHtml(rewriteData.rewrittenContent)}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  Copy
                </button>
              </div>
            </div>
          `;
          
          // Bind copy button
          const copyBtn = rewriteVariations.querySelector('.copy-btn');
          if (copyBtn) {
            copyBtn.addEventListener('click', () => {
              this.copyToClipboard(rewriteData.rewrittenContent);
            });
          }
          
          rewriteResults.style.display = 'block';
        }
        
        console.log('Loaded rewrite data:', rewriteData);
      } catch (error) {
        console.error('Failed to load rewrite data:', error);
      }
    }

    updateCharCount(elementId, count) {
      const element = document.getElementById(elementId);
      if (element) {
        element.textContent = count;
        if (count > 280) {
          element.style.color = '#ef4444';
        } else {
          element.style.color = '#6b7280';
        }
      }
    }
  }

  // Initialize popup when DOM is loaded
  document.addEventListener("DOMContentLoaded", () => {
    window.xThreadsPopupInstance = new XThreadsPopup();
  });

  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "updateStats") {
      // Handle stats updates if needed
    } else if (message.action === "agentStopped") {
      // Handle agent stopped notification
      if (window.xThreadsPopupInstance) {
        window.xThreadsPopupInstance.handleAgentStopped(message);
      }
    }
  });
}
