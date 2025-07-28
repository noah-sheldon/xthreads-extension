// xThreads Extension Background Script

class XThreadsBackground {
  constructor() {
    this.init();
  }

  init() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        this.handleInstall();
      } else if (details.reason === 'update') {
        this.handleUpdate(details.previousVersion);
      }
    });

    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Handle tab updates to inject content script if needed
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && this.isXUrl(tab.url)) {
        this.ensureContentScript(tabId);
      }
    });

    // Clean up old data periodically
    this.setupCleanupSchedule();
  }

  handleInstall() {
    console.log('xThreads Extension installed');
    
    // Set default settings without API key
    chrome.storage.local.set({
      xthreads_settings: {
        apiKey: '',
        keywords: [],
        tone: 'neutral',
        mode: 'manual',
        isActive: false,
        isOnboarded: false
      },
      xthreads_stats: {
        repliesCount: 0,
        successCount: 0,
        totalAttempts: 0
      }
    });

    // Open onboarding page
    chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding.html')
    });
  }

  handleUpdate(previousVersion) {
    console.log(`xThreads Extension updated from ${previousVersion}`);
    
    // Handle any migration logic here if needed
    this.migrateSettings(previousVersion);
  }

  async migrateSettings(previousVersion) {
    try {
      const result = await chrome.storage.local.get(['xthreads_settings']);
      const settings = result.xthreads_settings || {};
      
      // Add any new default settings that might be missing
      const defaultSettings = {
        apiKey: '',
        keywords: [],
        tone: 'neutral',
        mode: 'manual',
        isActive: false
      };

      const migratedSettings = { ...defaultSettings, ...settings };
      
      await chrome.storage.local.set({
        xthreads_settings: migratedSettings
      });
      
      console.log('Settings migrated successfully');
    } catch (error) {
      console.error('Failed to migrate settings:', error);
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'getSettings':
          const settings = await this.getSettings();
          sendResponse({ success: true, settings });
          break;

        case 'saveSettings':
          await this.saveSettings(message.settings);
          sendResponse({ success: true });
          break;

        case 'updateStats':
          await this.updateStats(message.stats);
          sendResponse({ success: true });
          break;

        case 'getStats':
          const stats = await this.getStats();
          sendResponse({ success: true, stats });
          break;

        case 'resetStats':
          await this.resetStats();
          sendResponse({ success: true });
          break;

        case 'checkApiKey':
          const isValid = await this.validateApiKey(message.apiKey);
          sendResponse({ success: true, isValid });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Background script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async getSettings() {
    const result = await chrome.storage.local.get('xthreads_settings');
    return result.xthreads_settings || {};
  }

  async saveSettings(settings) {
    await chrome.storage.local.set({ xthreads_settings: settings });
  }

  async getStats() {
    const result = await chrome.storage.local.get('xthreads_stats');
    return result.xthreads_stats || {
      repliesCount: 0,
      successCount: 0,
      totalAttempts: 0
    };
  }

  async updateStats(newStats) {
    const currentStats = await this.getStats();
    
    const updatedStats = {
      repliesCount: currentStats.repliesCount + (newStats.repliesCount || 0),
      successCount: currentStats.successCount + (newStats.successCount || 0),
      totalAttempts: currentStats.totalAttempts + (newStats.totalAttempts || 0)
    };

    await chrome.storage.local.set({ xthreads_stats: updatedStats });
    
    // Notify popup if it's open
    try {
      chrome.runtime.sendMessage({
        action: 'statsUpdated',
        stats: updatedStats
      });
    } catch (error) {
      // Popup might not be open, ignore error
    }
  }

  async resetStats() {
    const defaultStats = {
      repliesCount: 0,
      successCount: 0,
      totalAttempts: 0
    };
    
    await chrome.storage.local.set({ xthreads_stats: defaultStats });
  }

  async validateApiKey(apiKey) {
    if (!apiKey || apiKey.length < 10) {
      return false;
    }

    try {
      // Test API key with a simple request
      const response = await fetch('https://xthreads.app/api/ai-reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          tweet: 'Test tweet for API validation',
          tone: 'neutral'
        })
      });

      return response.ok;
    } catch (error) {
      console.error('API key validation failed:', error);
      return false;
    }
  }

  isXUrl(url) {
    return url && (url.includes('x.com') || url.includes('twitter.com'));
  }

  async ensureContentScript(tabId) {
    try {
      // Check if content script is already injected
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.xthreadsAgentInjected === true
      });

      if (!results[0]?.result) {
        // Inject content script
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });

        await chrome.scripting.insertCSS({
          target: { tabId },
          files: ['content.css']
        });

        console.log('Content script injected into tab:', tabId);
      }
    } catch (error) {
      console.error('Failed to inject content script:', error);
    }
  }

  setupCleanupSchedule() {
    // Clean up old data every 24 hours
    setInterval(async () => {
      await this.cleanupOldData();
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Initial cleanup
    setTimeout(() => this.cleanupOldData(), 5000);
  }

  async cleanupOldData() {
    try {
      console.log('Running data cleanup...');
      
      // Clean up old replied tweets (older than 48 hours)
      const result = await chrome.storage.local.get('xthreads_replied_tweets');
      if (result.xthreads_replied_tweets) {
        const cutoff = Date.now() - (48 * 60 * 60 * 1000); // 48 hours
        const validTweets = result.xthreads_replied_tweets.filter(
          tweet => tweet.timestamp > cutoff
        );
        
        if (validTweets.length !== result.xthreads_replied_tweets.length) {
          await chrome.storage.local.set({
            xthreads_replied_tweets: validTweets
          });
          console.log(`Cleaned up ${result.xthreads_replied_tweets.length - validTweets.length} old tweet records`);
        }
      }

      // Reset daily stats if it's a new day
      const lastResetDate = await chrome.storage.local.get('last_stats_reset');
      const today = new Date().toDateString();
      
      if (lastResetDate.last_stats_reset !== today) {
        await this.resetStats();
        await chrome.storage.local.set({ last_stats_reset: today });
        console.log('Daily stats reset');
      }

    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }
}

// Initialize background script
new XThreadsBackground();