// Guard against multiple injections
if (!window.__xthreads_popup_injected__) {
  window.__xthreads_popup_injected__ = true;

class XThreadsPopup {
  constructor() {
    this.settings = {
      apiKey: '',
      keywords: [],
      tone: 'neutral',
      mode: 'manual',
      isActive: false
    };
    
    this.stats = {
      repliesCount: 0,
      successCount: 0,
      totalAttempts: 0
    };

    this.currentTab = 'rewrite';
    this.init();
  }

  async init() {
    await this.loadSettings();
    
    // Check if user has completed onboarding
    if (!this.settings.isOnboarded) {
      this.showOnboardingPrompt();
      return;
    }
    
    this.bindEvents();
    this.updateUI();
    this.updateStats();
  }

  showOnboardingPrompt() {
    const container = document.querySelector('.container');
    container.innerHTML = `
      <div class="onboarding-prompt" style="padding: 40px 20px; text-align: center;">
        <div class="logo" style="margin-bottom: 20px;">
          <img src="assets/logo16.png" alt="xThreads" width="32" height="32" />
          <h2 style="margin-top: 12px; color: #1f2937;">Welcome to xThreads Agent</h2>
        </div>
        <p style="color: #6b7280; margin-bottom: 24px;">Please complete the setup process to start using the extension.</p>
        <button id="openOnboarding" class="btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15,3 21,3 21,9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Complete Setup
        </button>
      </div>
    `;

    document.getElementById('openOnboarding').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
      window.close();
    });
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
        xthreads_settings: this.settings,
        xthreads_stats: this.stats
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  bindEvents() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Settings modal
    document.getElementById('settingsBtn').addEventListener('click', () => {
      this.openSettings();
    });

    document.getElementById('closeSettings').addEventListener('click', () => {
      this.closeSettings();
    });

    // Rewrite tab
    this.bindRewriteEvents();
    
    // Thread tab
    this.bindThreadEvents();
    
    // Agent tab
    this.bindAgentEvents();

    // Settings
    this.bindSettingsEvents();
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
      this.generateRewrites();
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
    const startBtn = document.getElementById('startAgentBtn');
    const stopBtn = document.getElementById('stopAgentBtn');

    // Load current settings
    keywordsInput.value = this.settings.keywords.join(', ');
    toneSelect.value = this.settings.tone;

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

    startBtn.addEventListener('click', () => {
      this.startAgent();
    });

    stopBtn.addEventListener('click', () => {
      this.stopAgent();
    });
  }

  bindSettingsEvents() {
    const apiKeyInput = document.getElementById('settingsApiKey');
    const fetchBtn = document.getElementById('fetchApiKeyBtn');
    const saveBtn = document.getElementById('saveSettingsBtn');

    apiKeyInput.value = this.settings.apiKey;

    fetchBtn.addEventListener('click', () => {
      this.fetchApiKeyFromXThreads();
    });

    saveBtn.addEventListener('click', () => {
      this.settings.apiKey = apiKeyInput.value.trim();
      this.saveSettings();
      this.closeSettings();
      this.showToast('Settings saved successfully!', 'success');
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

  async generateRewrites() {
    const input = document.getElementById('rewriteInput');
    const tone = document.getElementById('rewriteTone').value;
    const language = document.getElementById('rewriteLanguage').value;
    const btn = document.getElementById('rewriteBtn');
    const results = document.getElementById('rewriteResults');
    const variations = document.getElementById('rewriteVariations');

    if (!input.value.trim()) {
      this.showToast('Please enter a tweet to rewrite', 'error');
      return;
    }

    if (!this.settings.apiKey) {
      this.showToast('Please configure your API key in settings', 'error');
      return;
    }

    // Show loading state
    btn.classList.add('loading');
    btn.disabled = true;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1"/>
        <path d="M16 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1"/>
        <path d="M11 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1"/>
      </svg>
      Generating...
    `;

    try {
      const response = await fetch('https://www.xthreads.app/api/rewrite', {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.settings.apiKey
        },
        body: JSON.stringify({
          post: input.value.trim(),
          tone: tone,
          language: language
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.variations && data.variations.length > 0) {
        this.displayRewrites(data.variations);
        results.style.display = 'block';
      } else {
        throw new Error('No variations generated');
      }
    } catch (error) {
      console.error('Failed to generate rewrites:', error);
      this.showToast('Failed to generate rewrites. Please try again.', 'error');
    } finally {
      // Reset button
      btn.classList.remove('loading');
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        Generate Rewrites
      `;
    }
  }

  displayRewrites(variations) {
    const container = document.getElementById('rewriteVariations');
    container.innerHTML = '';

    variations.forEach((variation, index) => {
      const item = document.createElement('div');
      item.className = 'result-item';
      item.innerHTML = `
        <div class="result-text">${variation}</div>
        <div class="result-actions">
          <button class="use-btn" data-text="${variation.replace(/"/g, '&quot;')}">Use this</button>
        </div>
      `;
      container.appendChild(item);
    });

    // Bind use buttons
    container.querySelectorAll('.use-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.useRewrite(e.target.dataset.text);
      });
    });
  }

  async useRewrite(text) {
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
        // Wait for tab to load
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Send message to content script to type the text
      await chrome.tabs.sendMessage(targetTab.id, {
        action: 'typeInComposer',
        text: text
      });

      this.showToast('Text posted successfully!', 'success');
      window.close();

    } catch (error) {
      console.error('Failed to use rewrite:', error);
      this.showToast('Failed to post text. Please try again.', 'error');
    }
  }

  async generateThread() {
    const input = document.getElementById('threadInput');
    const tone = document.getElementById('threadTone').value;
    const language = document.getElementById('threadLanguage').value;
    const btn = document.getElementById('threadBtn');
    const results = document.getElementById('threadResults');
    const preview = document.getElementById('threadPreview');

    if (!input.value.trim()) {
      this.showToast('Please enter content for the thread', 'error');
      return;
    }

    if (!this.settings.apiKey) {
      this.showToast('Please configure your API key in settings', 'error');
      return;
    }

    // Show loading state
    btn.classList.add('loading');
    btn.disabled = true;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1"/>
        <path d="M16 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1"/>
        <path d="M11 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1"/>
      </svg>
      Generating...
    `;

    try {
      const response = await fetch('https://www.xthreads.app/api/thread', {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.settings.apiKey
        },
        body: JSON.stringify({
          content: input.value.trim(),
          tone: tone,
          language: language
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.thread && data.thread.length > 0) {
        this.displayThread(data.thread);
        results.style.display = 'block';
        this.currentThread = data.thread;
      } else {
        throw new Error('No thread generated');
      }
    } catch (error) {
      console.error('Failed to generate thread:', error);
      this.showToast('Failed to generate thread. Please try again.', 'error');
    } finally {
      // Reset button
      btn.classList.remove('loading');
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
        </svg>
        Generate Thread
      `;
    }
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
        // Wait for tab to load
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Send message to content script to post the thread
      await chrome.tabs.sendMessage(targetTab.id, {
        action: 'postThread',
        thread: this.currentThread
      });

      this.showToast('Thread posted successfully!', 'success');
      window.close();

    } catch (error) {
      console.error('Failed to post thread:', error);
      this.showToast('Failed to post thread. Please try again.', 'error');
    }
  }

  async startAgent() {
    if (!this.settings.apiKey || this.settings.keywords.length === 0) {
      this.showToast('Please configure API key and keywords first', 'error');
      return;
    }

    try {
      // Get active X.com tab
      const tabs = await chrome.tabs.query({ 
        active: true, 
        url: ['https://x.com/*', 'https://twitter.com/*'] 
      });

      if (tabs.length === 0) {
        this.showToast('Please open X.com in the active tab', 'error');
        return;
      }

      this.settings.isActive = true;
      await this.saveSettings();

      // Send message to content script
      await chrome.tabs.sendMessage(tabs[0].id, {
        action: 'startAgent',
        settings: this.settings
      });

      this.updateAgentUI();
      this.showToast('Agent started successfully', 'success');

    } catch (error) {
      console.error('Failed to start agent:', error);
      this.showToast('Failed to start agent. Please refresh X.com.', 'error');
      this.settings.isActive = false;
      this.saveSettings();
      this.updateAgentUI();
    }
  }

  async stopAgent() {
    try {
      const tabs = await chrome.tabs.query({ 
        url: ['https://x.com/*', 'https://twitter.com/*'] 
      });

      this.settings.isActive = false;
      await this.saveSettings();

      // Send stop message to all X.com tabs
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'stopAgent' });
        } catch (error) {
          console.log('Could not send stop message to tab:', tab.id);
        }
      }

      this.updateAgentUI();
      this.showToast('Agent stopped', 'info');

    } catch (error) {
      console.error('Failed to stop agent:', error);
      this.showToast('Agent stopped (with errors)', 'error');
    }
  }

  updateUI() {
    this.updateAgentUI();
  }

  updateAgentUI() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('statusText');
    const statusDotLarge = document.querySelector('.status-dot-large');
    const agentStatusText = document.getElementById('agentStatusText');
    const startBtn = document.getElementById('startAgentBtn');
    const stopBtn = document.getElementById('stopAgentBtn');

    if (this.settings.isActive) {
      statusDot?.classList.add('active');
      statusDotLarge?.classList.add('active');
      if (statusText) statusText.textContent = 'Active';
      if (agentStatusText) agentStatusText.textContent = 'Active';
      if (startBtn) startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'flex';
    } else {
      statusDot?.classList.remove('active');
      statusDotLarge?.classList.remove('active');
      if (statusText) statusText.textContent = 'Inactive';
      if (agentStatusText) agentStatusText.textContent = 'Inactive';
      if (startBtn) startBtn.style.display = 'flex';
      if (stopBtn) stopBtn.style.display = 'none';
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
    document.getElementById('settingsModal').style.display = 'flex';
    document.getElementById('settingsApiKey').value = this.settings.apiKey;
  }

  closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
  }

  async fetchApiKeyFromXThreads() {
    try {
      this.showToast('Checking xthreads.app for API key...', 'info');
      
      const tabs = await chrome.tabs.query({ url: 'https://xthreads.app/*' });
      
      if (tabs.length === 0) {
        this.showToast('Please open xthreads.app in a tab first', 'error');
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          const apiKeyElement = document.querySelector('[data-api-key]') || 
                               document.querySelector('.api-key') ||
                               document.querySelector('#api-key');
          
          if (apiKeyElement) {
            return apiKeyElement.textContent || apiKeyElement.value || apiKeyElement.dataset.apiKey;
          }
          
          const storedKey = localStorage.getItem('xthreads_api_key') || 
                           localStorage.getItem('apiKey') ||
                           localStorage.getItem('api_key');
          
          return storedKey;
        }
      });

      if (results[0]?.result) {
        document.getElementById('settingsApiKey').value = results[0].result;
        this.showToast('API key fetched successfully!', 'success');
      } else {
        this.showToast('No API key found. Please copy it manually.', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch API key:', error);
      this.showToast('Failed to fetch API key. Please enter manually.', 'error');
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
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
    const popup = window.xthreadsPopup;
    if (popup) {
      popup.stats = { ...popup.stats, ...message.stats };
      popup.saveSettings();
      popup.updateStats();
    }
  }
});

}