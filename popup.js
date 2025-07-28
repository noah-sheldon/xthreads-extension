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
    // Show a message directing user to complete onboarding
    const container = document.querySelector('.container');
    container.innerHTML = `
      <div class="onboarding-prompt">
        <div class="logo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          </svg>
          <h2>Welcome to xThreads Agent</h2>
        </div>
        <p>Please complete the setup process to start using the extension.</p>
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
    // API Key input
    const apiKeyInput = document.getElementById('apiKey');
    apiKeyInput.value = this.settings.apiKey;
    apiKeyInput.addEventListener('input', (e) => {
      this.settings.apiKey = e.target.value.trim();
      this.validateSettings();
      this.saveSettings();
    });

    // Fetch API Key button
    document.getElementById('fetchApiKey').addEventListener('click', () => {
      this.fetchApiKeyFromXThreads();
    });

    // Keywords input
    const keywordsInput = document.getElementById('keywords');
    keywordsInput.value = this.settings.keywords.join(', ');
    keywordsInput.addEventListener('input', (e) => {
      this.settings.keywords = e.target.value
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
      this.saveSettings();
    });

    // Tone buttons
    document.querySelectorAll('.tone-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tone-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.settings.tone = e.target.dataset.tone;
        this.saveSettings();
      });
    });

    // Mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.settings.mode = e.target.dataset.mode;
        this.saveSettings();
      });
    });

    // Start/Stop buttons
    document.getElementById('startAgent').addEventListener('click', () => {
      this.startAgent();
    });

    document.getElementById('stopAgent').addEventListener('click', () => {
      this.stopAgent();
    });
  }

  updateUI() {
    // Update tone selection
    document.querySelectorAll('.tone-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tone === this.settings.tone);
    });

    // Update mode selection
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === this.settings.mode);
    });

    // Update status
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('statusText');
    const startBtn = document.getElementById('startAgent');
    const stopBtn = document.getElementById('stopAgent');

    if (this.settings.isActive) {
      statusDot.classList.add('active');
      statusText.textContent = 'Active';
      startBtn.style.display = 'none';
      stopBtn.style.display = 'flex';
    } else {
      statusDot.classList.remove('active');
      statusText.textContent = 'Inactive';
      startBtn.style.display = 'flex';
      stopBtn.style.display = 'none';
    }

    this.validateSettings();
  }

  validateSettings() {
    const startBtn = document.getElementById('startAgent');
    const isValid = this.settings.apiKey.length > 0 && this.settings.keywords.length > 0;
    startBtn.disabled = !isValid;
  }

  updateStats() {
    document.getElementById('repliesCount').textContent = this.stats.repliesCount;
    const successRate = this.stats.totalAttempts > 0 
      ? Math.round((this.stats.successCount / this.stats.totalAttempts) * 100)
      : 0;
    document.getElementById('successRate').textContent = `${successRate}%`;
    
    if (this.stats.repliesCount > 0) {
      document.getElementById('stats').style.display = 'flex';
    }
  }

  async fetchApiKeyFromXThreads() {
    try {
      this.showToast('Checking xthreads.app for API key...', 'info');
      
      // Try to get API key from xthreads.app if user is logged in
      const tabs = await chrome.tabs.query({ url: 'https://xthreads.app/*' });
      
      if (tabs.length === 0) {
        this.showToast('Please open xthreads.app in a tab first', 'error');
        return;
      }

      // Execute script to get API key from the page
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => {
          // Look for API key in common places
          const apiKeyElement = document.querySelector('[data-api-key]') || 
                               document.querySelector('.api-key') ||
                               document.querySelector('#api-key');
          
          if (apiKeyElement) {
            return apiKeyElement.textContent || apiKeyElement.value || apiKeyElement.dataset.apiKey;
          }
          
          // Check localStorage
          const storedKey = localStorage.getItem('xthreads_api_key') || 
                           localStorage.getItem('apiKey') ||
                           localStorage.getItem('api_key');
          
          return storedKey;
        }
      });

      if (results[0]?.result) {
        document.getElementById('apiKey').value = results[0].result;
        this.settings.apiKey = results[0].result;
        this.saveSettings();
        this.validateSettings();
        this.showToast('API key fetched successfully!', 'success');
      } else {
        this.showToast('No API key found. Please copy it manually.', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch API key:', error);
      this.showToast('Failed to fetch API key. Please enter manually.', 'error');
    }
  }

  async startAgent() {
    if (!this.settings.apiKey || this.settings.keywords.length === 0) {
      this.showToast('Please enter API key and keywords first', 'error');
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

      this.updateUI();
      this.showToast(`Agent started in ${this.settings.mode} mode`, 'success');

    } catch (error) {
      console.error('Failed to start agent:', error);
      this.showToast('Failed to start agent. Please refresh X.com.', 'error');
      this.settings.isActive = false;
      this.saveSettings();
      this.updateUI();
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
          // Tab might be closed or not responsive
          console.log('Could not send stop message to tab:', tab.id);
        }
      }

      this.updateUI();
      this.showToast('Agent stopped', 'info');

    } catch (error) {
      console.error('Failed to stop agent:', error);
      this.showToast('Agent stopped (with errors)', 'error');
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
    // Update stats from content script
    const popup = window.xthreadsPopup;
    if (popup) {
      popup.stats = { ...popup.stats, ...message.stats };
      popup.saveSettings();
      popup.updateStats();
    }
  }
});