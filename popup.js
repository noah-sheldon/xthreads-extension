// Guard against multiple injections
if (!window.__xthreads_popup_injected__) {
  window.__xthreads_popup_injected__ = true;

class XThreadsPopup {
  constructor() {
    this.settings = {
      apiKey: '',
      selectedBrandId: '',
      keywords: [],
      tone: 'professional',
      isOnboarded: false,
      isActive: false
    };
    
    this.stats = {
      repliesCount: 0,
      successCount: 0,
      totalAttempts: 0
    };

    this.brandSpaces = [];
    this.currentTab = 'generate';
    this.currentThread = [];
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    
    // Check if user has completed onboarding
    if (!this.settings.isOnboarded || !this.settings.apiKey) {
      chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
      window.close();
      return;
    }
    
    this.bindEvents();
    this.updateApiKeyDisplay();
    this.loadBrandSpaces();
    this.updateUI();
    this.updateStats();
  }


  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['xthreads_settings', 'xthreads_stats']);
      if (result.xthreads_settings) {
        this.settings = { ...this.settings, ...result.xthreads_settings };
      }
      if (result.xthreads_stats) {
        this.stats = { ...this.stats, ...result.xthreads_stats };
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set({ 
        xthreads_settings: this.settings
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  async loadBrandSpaces() {
    if (!this.settings.apiKey) return;

    try {
      const response = await fetch('https://www.xthreads.app/api/brandspaces', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.settings.apiKey
        }
      });

      if (response.ok) {
        const data = await response.json();
        this.brandSpaces = data.brandSpaces || [];
        this.updateBrandSpaceSelectors();
      } else {
        console.error('Failed to load brand spaces:', response.status);
      }
    } catch (error) {
      console.error('Failed to load brand spaces:', error);
    }
  }

  updateBrandSpaceSelectors() {
    const select = document.getElementById('settingsBrandSpace');
    if (select) {
      select.innerHTML = '';
      
      if (this.brandSpaces.length === 0) {
        select.innerHTML = '<option value="">No brand spaces found</option>';
      } else {
        select.innerHTML = '<option value="">Select brand space</option>';
        this.brandSpaces.forEach(brand => {
          const option = document.createElement('option');
          option.value = brand.id;
          option.textContent = brand.name;
          option.selected = brand.id === this.settings.selectedBrandId;
          select.appendChild(option);
        });
      }
    }
  }

  bindEvents() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchTab(e.target.closest('.tab-btn').dataset.tab);
      });
    });

    // Settings modal
    document.getElementById('settingsBtn').addEventListener('click', () => {
      this.openSettings();
    });

    document.getElementById('closeSettings').addEventListener('click', () => {
      this.closeSettings();
    });

    // Bind tab-specific events
    this.bindGenerateEvents();
    this.bindRewriteEvents();
    this.bindThreadEvents();
    this.bindAgentEvents();
    this.bindSettingsEvents();
  }

  bindGenerateEvents() {
    const input = document.getElementById('generateInput');
    const btn = document.getElementById('generateBtn');

    input.addEventListener('input', (e) => {
      btn.disabled = e.target.value.trim().length === 0;
    });

    btn.addEventListener('click', () => {
      this.generateTweet();
    });
  }

  bindRewriteEvents() {
    const input = document.getElementById('rewriteInput');
    const charCount = document.getElementById('rewriteCharCount');
    const btn = document.getElementById('rewriteBtn');

    input.addEventListener('input', (e) => {
      const length = e.target.value.length;
      charCount.textContent = length;
      btn.disabled = length === 0;
      
      if (length > 280) {
        charCount.style.color = '#ef4444';
      } else {
        charCount.style.color = '#6b7280';
      }
    });

    btn.addEventListener('click', () => {
      this.rewriteContent();
    });
  }

  bindThreadEvents() {
    const input = document.getElementById('threadInput');
    const btn = document.getElementById('threadBtn');

    input.addEventListener('input', (e) => {
      btn.disabled = e.target.value.trim().length === 0;
    });

    btn.addEventListener('click', () => {
      this.generateThread();
    });

    // Post thread button (will be added dynamically)
    document.addEventListener('click', (e) => {
      if (e.target.id === 'postThreadBtn') {
        this.postThread();
      }
    });
  }

  bindAgentEvents() {
    const keywordsInput = document.getElementById('agentKeywords');
    const toneSelect = document.getElementById('agentTone');
    const agentToggle = document.getElementById('agentToggle');

    // Load current settings
    keywordsInput.value = this.settings.keywords.join(', ');
    toneSelect.value = this.settings.tone;
    agentToggle.checked = this.settings.isActive;

    keywordsInput.addEventListener('input', (e) => {
      this.settings.keywords = e.target.value
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
      this.saveSettings();
    });

    toneSelect.addEventListener('change', (e) => {
      this.settings.tone = e.target.value;
      this.saveSettings();
    });

    agentToggle.addEventListener('change', (e) => {
      this.toggleAgent(e.target.checked);
    });
  }

  bindSettingsEvents() {
    const apiKeyInput = document.getElementById('settingsApiKey');
    const keywordsInput = document.getElementById('settingsKeywords');
    const updateBtn = document.getElementById('updateApiKeyBtn');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    const cancelApiKeyBtn = document.getElementById('cancelApiKeyBtn');
    const saveBtn = document.getElementById('saveSettingsBtn');
    const apiKeyInputGroup = document.getElementById('apiKeyInputGroup');

    // Load current settings
    keywordsInput.value = this.settings.keywords.join(', ');

    // Set tone radio buttons
    const toneRadio = document.querySelector(`input[name="settingsTone"][value="${this.settings.tone}"]`);
    if (toneRadio) toneRadio.checked = true;

    // API Key edit flow
    updateBtn.addEventListener('click', () => {
      apiKeyInputGroup.style.display = 'block';
      apiKeyInput.value = '';
      apiKeyInput.focus();
    });

    cancelApiKeyBtn.addEventListener('click', () => {
      apiKeyInputGroup.style.display = 'none';
      apiKeyInput.value = '';
    });

    saveApiKeyBtn.addEventListener('click', () => {
      this.updateApiKey();
    });

    saveBtn.addEventListener('click', () => {
      this.saveSettingsFromModal();
    });
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `${tabName}-tab`);
    });

    this.currentTab = tabName;
  }

  async generateTweet() {
    const input = document.getElementById('generateInput');
    const tone = document.getElementById('generateTone').value;
    const btn = document.getElementById('generateBtn');
    const results = document.getElementById('generateResults');

    if (!input.value.trim()) {
      this.showToast('Please enter a prompt for the tweet', 'error');
      return;
    }

    if (!this.settings.selectedBrandId) {
      this.showToast('Please select a brand space in settings', 'error');
      return;
    }

    this.showLoading(btn, 'Generating...');

    try {
      const response = await fetch('https://www.xthreads.app/api/generate-tweet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.settings.apiKey
        },
        body: JSON.stringify({
          prompt: input.value.trim(),
          brandId: this.settings.selectedBrandId,
          tone: tone
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const tweet = this.validateAndTruncateContent(data.tweet);
      
      this.displayGeneratedContent([tweet], 'generateVariations');
      results.style.display = 'block';
      
    } catch (error) {
      console.error('Failed to generate tweet:', error);
      this.showToast('Failed to generate tweet. Please try again.', 'error');
    } finally {
      this.resetButton(btn, 'Generate Tweet', `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5,3 19,12 5,21"/>
        </svg>
        Generate Tweet
      `);
    }
  }

  async rewriteContent() {
    const input = document.getElementById('rewriteInput');
    const tone = document.getElementById('rewriteTone').value;
    const btn = document.getElementById('rewriteBtn');
    const results = document.getElementById('rewriteResults');

    if (!input.value.trim()) {
      this.showToast('Please enter content to rewrite', 'error');
      return;
    }

    if (!this.settings.selectedBrandId) {
      this.showToast('Please select a brand space in settings', 'error');
      return;
    }

    this.showLoading(btn, 'Rewriting...');

    try {
      const response = await fetch('https://www.xthreads.app/api/rewrite-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.settings.apiKey
        },
        body: JSON.stringify({
          originalContent: input.value.trim(),
          brandId: this.settings.selectedBrandId,
          tone: tone
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const variations = data.variations || [data.rewrittenContent];
      const validatedVariations = variations.map(v => this.validateAndTruncateContent(v));
      
      this.displayGeneratedContent(validatedVariations, 'rewriteVariations');
      results.style.display = 'block';
      
    } catch (error) {
      console.error('Failed to rewrite content:', error);
      this.showToast('Failed to rewrite content. Please try again.', 'error');
    } finally {
      this.resetButton(btn, 'Rewrite', `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        Rewrite
      `);
    }
  }

  async generateThread() {
    const input = document.getElementById('threadInput');
    const tone = document.getElementById('threadTone').value;
    const btn = document.getElementById('threadBtn');
    const results = document.getElementById('threadResults');

    if (!input.value.trim()) {
      this.showToast('Please enter content for the thread', 'error');
      return;
    }

    if (!this.settings.selectedBrandId) {
      this.showToast('Please select a brand space in settings', 'error');
      return;
    }

    this.showLoading(btn, 'Generating...');

    try {
      const response = await fetch('https://www.xthreads.app/api/generate-thread', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.settings.apiKey
        },
        body: JSON.stringify({
          prompt: input.value.trim(),
          brandId: this.settings.selectedBrandId,
          tone: tone
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const thread = data.thread || [];
      const validatedThread = thread.map(tweet => this.validateAndTruncateContent(tweet));
      
      this.currentThread = validatedThread;
      this.displayThread(validatedThread);
      results.style.display = 'block';
      
    } catch (error) {
      console.error('Failed to generate thread:', error);
      this.showToast('Failed to generate thread. Please try again.', 'error');
    } finally {
      this.resetButton(btn, 'Generate Thread', `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
        </svg>
        Generate Thread
      `);
    }
  }

  async toggleAgent(isActive) {
    this.settings.isActive = isActive;
    await this.saveSettings();

    try {
      // Get current X.com tabs
      const tabs = await chrome.tabs.query({ 
        url: ['https://x.com/*', 'https://twitter.com/*'] 
      });

      const message = {
        action: isActive ? 'startAgent' : 'stopAgent',
        settings: this.settings
      };

      // Send message to all X.com tabs
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, message);
        } catch (error) {
          console.log('Could not send message to tab:', tab.id);
        }
      }

      this.updateAgentUI();
      this.showToast(isActive ? 'Agent activated' : 'Agent deactivated', 'success');

    } catch (error) {
      console.error('Failed to toggle agent:', error);
      this.showToast('Failed to toggle agent', 'error');
      
      // Revert toggle state
      document.getElementById('agentToggle').checked = !isActive;
      this.settings.isActive = !isActive;
    }
  }

  validateAndTruncateContent(content) {
    if (!content) return '';
    
    let cleaned = content.trim();
    
    if (cleaned.length > 280) {
      cleaned = cleaned.substring(0, 277) + '...';
      this.showToast('Content truncated to 280 characters', 'info');
    }
    
    return cleaned;
  }

  displayGeneratedContent(variations, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    variations.forEach((variation, index) => {
      const item = document.createElement('div');
      item.className = 'result-item';
      item.innerHTML = `
        <div class="result-text">${variation}</div>
        <div class="result-actions">
          <button class="use-btn" data-text="${this.escapeHtml(variation)}">Use this</button>
        </div>
      `;
      container.appendChild(item);
    });

    // Bind use buttons
    container.querySelectorAll('.use-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.useContent(e.target.dataset.text);
      });
    });
  }

  displayThread(thread) {
    const container = document.getElementById('threadPreview');
    container.innerHTML = '';

    thread.forEach((tweet, index) => {
      const item = document.createElement('div');
      item.className = 'thread-tweet';
      item.setAttribute('data-index', index + 1);
      item.innerHTML = `
        <div class="thread-tweet-text">${tweet}</div>
      `;
      container.appendChild(item);
    });
  }

  async useContent(text) {
    try {
      // Get active X.com tab or create one
      const tabs = await chrome.tabs.query({ 
        url: ['https://x.com/*', 'https://twitter.com/*'] 
      });

      let targetTab;
      if (tabs.length > 0) {
        targetTab = tabs[0];
        await chrome.tabs.update(targetTab.id, { active: true });
      } else {
        targetTab = await chrome.tabs.create({ url: 'https://x.com/compose/tweet' });
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Send message to content script to type the text
      await chrome.tabs.sendMessage(targetTab.id, {
        action: 'typeInComposer',
        text: text
      });

      this.showToast('Content ready to post!', 'success');
      window.close();

    } catch (error) {
      console.error('Failed to use content:', error);
      this.showToast('Failed to insert content. Please try again.', 'error');
    }
  }

  async postThread() {
    if (!this.currentThread || this.currentThread.length === 0) {
      this.showToast('No thread to post', 'error');
      return;
    }

    try {
      // Get active X.com tab or create one
      const tabs = await chrome.tabs.query({ 
        url: ['https://x.com/*', 'https://twitter.com/*'] 
      });

      let targetTab;
      if (tabs.length > 0) {
        targetTab = tabs[0];
        await chrome.tabs.update(targetTab.id, { active: true });
      } else {
        targetTab = await chrome.tabs.create({ url: 'https://x.com/compose/tweet' });
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Send message to content script to post the thread
      await chrome.tabs.sendMessage(targetTab.id, {
        action: 'postThread',
        thread: this.currentThread
      });

      this.showToast('Thread ready to post!', 'success');
      window.close();

    } catch (error) {
      console.error('Failed to post thread:', error);
      this.showToast('Failed to post thread. Please try again.', 'error');
    }
  }

  async updateApiKey() {
    const apiKeyInput = document.getElementById('settingsApiKey');
    const newApiKey = apiKeyInput.value.trim();

    if (!newApiKey) {
      this.showToast('Please enter an API key', 'error');
      return;
    }

    try {
      // Validate the API key
      const response = await fetch('https://www.xthreads.app/api/validate-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiKey: newApiKey
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.valid) {
          this.settings.apiKey = newApiKey;
          await this.saveSettings();
          this.updateApiKeyDisplay();
          document.getElementById('apiKeyInputGroup').style.display = 'none';
          document.getElementById('settingsApiKey').value = '';
          await this.loadBrandSpaces();
          this.showToast('API key updated successfully!', 'success');
        } else {
          throw new Error('Invalid API key');
        }
      } else {
        throw new Error('API validation failed');
      }
    } catch (error) {
      console.error('Failed to update API key:', error);
      this.showToast('Invalid API key', 'error');
    }
  }

  async saveSettingsFromModal() {
    const brandSpaceSelect = document.getElementById('settingsBrandSpace');
    const keywordsInput = document.getElementById('settingsKeywords');
    const toneRadio = document.querySelector('input[name="settingsTone"]:checked');

    // Update settings
    this.settings.selectedBrandId = brandSpaceSelect.value;
    this.settings.keywords = keywordsInput.value
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    
    if (toneRadio) {
      this.settings.tone = toneRadio.value;
    }

    await this.saveSettings();
    this.updateBrandSpaceSelectors();
    this.closeSettings();
    this.showToast('Settings saved!', 'success');
  }

  updateUI() {
    this.updateAgentUI();
  }

  updateAgentUI() {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const agentStatusDot = document.getElementById('agentStatusDot');
    const agentStatusText = document.getElementById('agentStatusText');

    if (this.settings.isActive) {
      statusDot?.classList.add('active');
      agentStatusDot?.classList.add('active');
      if (statusText) statusText.textContent = 'Active';
      if (agentStatusText) agentStatusText.textContent = 'Active';
    } else {
      statusDot?.classList.remove('active');
      agentStatusDot?.classList.remove('active');
      if (statusText) statusText.textContent = 'Inactive';
      if (agentStatusText) agentStatusText.textContent = 'Inactive';
    }
  }

  updateStats() {
    const repliesCount = document.getElementById('repliesCount');
    const successRate = document.getElementById('successRate');
    
    if (repliesCount) repliesCount.textContent = this.stats.repliesCount;
    
    if (successRate) {
      const rate = this.stats.totalAttempts > 0 
        ? Math.round((this.stats.successCount / this.stats.totalAttempts) * 100)
        : 0;
      successRate.textContent = `${rate}%`;
    }
  }

  openSettings() {
    this.updateApiKeyDisplay();
    document.getElementById('settingsModal').style.display = 'flex';
  }

  closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
  }

  showLoading(button, text) {
    button.disabled = true;
    button.classList.add('loading');
    button.textContent = text;
  }

  resetButton(button, text, html) {
    button.disabled = false;
    button.classList.remove('loading');
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

  updateApiKeyDisplay() {
    const display = document.getElementById('currentApiKeyDisplay');
    if (display) {
      if (this.settings.apiKey) {
        // Show first 8 characters + masked rest  
        const maskedKey = this.settings.apiKey.substring(0, 8) + '••••••••••••••••';
        display.textContent = maskedKey;
        display.style.color = '#374151';
      } else {
        display.textContent = 'Not set';
        display.style.color = '#9ca3af';
      }
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 4000);
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new XThreadsPopup();
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateStats') {
    // Handle stats updates if needed
  }
});

}