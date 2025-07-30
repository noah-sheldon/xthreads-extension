// xThreads Extension Background Script

class XThreadsBackground {
  constructor() {
    this.agenticInterval = null;
    this.lastAgenticCheck = 0;
    this.agenticCheckDelay = 30000; // 30 seconds minimum between checks
    this.init();
  }

  init() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === "install") {
        this.handleInstall();
      } else if (details.reason === "update") {
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
      if (changeInfo.status === "complete" && this.isXUrl(tab.url)) {
        this.ensureContentScript(tabId);
      }
    });

    // Clean up old data periodically
    this.setupCleanupSchedule();
    
    // Start agentic monitoring if needed
    this.initializeAgenticMonitoring();
  }

  handleInstall() {
    console.log("xThreads Extension installed");

    // Set default settings with new structure
    chrome.storage.local.set({
      xthreads_settings: {
        apiKey: "",
        selectedBrandId: "",
        keywords: [],
        tone: "neutral",
        isActive: false,
        isOnboarded: false,
      },
      xthreads_stats: {
        repliesCount: 0,
        successCount: 0,
        totalAttempts: 0,
      },
      xthreads_replied_tweets: []
    });

    // Open onboarding page
    chrome.tabs.create({
      url: chrome.runtime.getURL("onboarding.html"),
    });
  }

  handleUpdate(previousVersion) {
    console.log(`xThreads Extension updated from ${previousVersion}`);
    this.migrateSettings(previousVersion);
  }

  async migrateSettings(previousVersion) {
    try {
      const result = await chrome.storage.local.get(["xthreads_settings"]);
      const settings = result.xthreads_settings || {};

      // Add any new default settings that might be missing
      const defaultSettings = {
        apiKey: "",
        selectedBrandId: "",
        keywords: [],
        tone: "neutral",
        isActive: false,
        isOnboarded: false,
      };

      const migratedSettings = { ...defaultSettings, ...settings };

      await chrome.storage.local.set({
        xthreads_settings: migratedSettings,
      });

      console.log("Settings migrated successfully");
    } catch (error) {
      console.error("Failed to migrate settings:", error);
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case "getSettings":
          const settings = await this.getSettings();
          sendResponse({ success: true, settings });
          break;

        case "saveSettings":
          await this.saveSettings(message.settings);
          sendResponse({ success: true });
          break;

        case "updateStats":
          await this.updateStats(message.stats);
          sendResponse({ success: true });
          break;

        case "getStats":
          const stats = await this.getStats();
          sendResponse({ success: true, stats });
          break;

        case "resetStats":
          await this.resetStats();
          sendResponse({ success: true });
          break;

        case "startAgent":
          await this.startAgenticMonitoring(message.settings);
          sendResponse({ success: true });
          break;

        case "stopAgent":
          this.stopAgenticMonitoring();
          sendResponse({ success: true });
          break;

        case "agenticReplyRequest":
          await this.handleAgenticReplyRequest(message.tweetData, sender.tab.id);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: "Unknown action" });
      }
    } catch (error) {
      console.error("Background script error:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async getSettings() {
    const result = await chrome.storage.local.get("xthreads_settings");
    return result.xthreads_settings || {};
  }

  async saveSettings(settings) {
    await chrome.storage.local.set({ xthreads_settings: settings });
    
    // Update agentic monitoring based on new settings
    if (settings.isActive) {
      await this.startAgenticMonitoring(settings);
    } else {
      this.stopAgenticMonitoring();
    }
  }

  async getStats() {
    const result = await chrome.storage.local.get("xthreads_stats");
    return (
      result.xthreads_stats || {
        repliesCount: 0,
        successCount: 0,
        totalAttempts: 0,
      }
    );
  }

  async updateStats(newStats) {
    const currentStats = await this.getStats();

    const updatedStats = {
      repliesCount: currentStats.repliesCount + (newStats.repliesCount || 0),
      successCount: currentStats.successCount + (newStats.successCount || 0),
      totalAttempts: currentStats.totalAttempts + (newStats.totalAttempts || 0),
    };

    await chrome.storage.local.set({ xthreads_stats: updatedStats });

    // Notify popup if it's open
    try {
      chrome.runtime.sendMessage({
        action: "statsUpdated",
        stats: updatedStats,
      });
    } catch (error) {
      // Popup might not be open, ignore error
    }
  }

  async resetStats() {
    const defaultStats = {
      repliesCount: 0,
      successCount: 0,
      totalAttempts: 0,
    };

    await chrome.storage.local.set({ xthreads_stats: defaultStats });
  }

  async initializeAgenticMonitoring() {
    const settings = await this.getSettings();
    if (settings.isActive && settings.apiKey && settings.keywords.length > 0) {
      await this.startAgenticMonitoring(settings);
    }
  }

  async startAgenticMonitoring(settings) {
    // Stop existing monitoring
    this.stopAgenticMonitoring();

    if (!settings.apiKey || settings.keywords.length === 0) {
      console.log("Cannot start agentic monitoring: missing API key or keywords");
      return;
    }

    console.log("Starting agentic monitoring with keywords:", settings.keywords);

    // Start periodic monitoring
    this.scheduleNextAgenticCheck(settings);
  }

  stopAgenticMonitoring() {
    if (this.agenticInterval) {
      clearTimeout(this.agenticInterval);
      this.agenticInterval = null;
      console.log("Agentic monitoring stopped");
    }
  }

  scheduleNextAgenticCheck(settings) {
    // Random interval between 30-60 seconds
    const delay = Math.floor(Math.random() * 30000) + 30000; // 30-60 seconds
    
    this.agenticInterval = setTimeout(async () => {
      await this.performAgenticCheck(settings);
      
      // Schedule next check if still active
      const currentSettings = await this.getSettings();
      if (currentSettings.isActive) {
        this.scheduleNextAgenticCheck(currentSettings);
      }
    }, delay);
  }

  async performAgenticCheck(settings) {
    try {
      console.log("Performing agentic check...");

      // Get X.com tabs
      const tabs = await chrome.tabs.query({
        url: ['https://x.com/*', 'https://twitter.com/*']
      });

      if (tabs.length === 0) {
        console.log("No X.com tabs found for agentic monitoring");
        return;
      }

      // Use the first X.com tab found
      const targetTab = tabs[0];

      // Construct search query from keywords
      const searchQuery = settings.keywords
        .map(keyword => `"${keyword}"`)
        .join(' OR ');

      const searchUrl = `https://x.com/search?q=${encodeURIComponent(searchQuery)}&src=typed_query&f=live`;

      console.log("Navigating to search:", searchUrl);

      // Navigate to search results
      await chrome.tabs.update(targetTab.id, { 
        url: searchUrl,
        active: false // Don't focus the tab
      });

      // Wait for page to load, then trigger content script analysis
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(targetTab.id, {
            action: 'scanForAgenticReplies',
            settings: settings
          });
        } catch (error) {
          console.log("Could not send scan message to tab:", error);
        }
      }, 3000); // Wait 3 seconds for page load

    } catch (error) {
      console.error("Agentic check failed:", error);
    }
  }

  async handleAgenticReplyRequest(tweetData, tabId) {
    try {
      const settings = await this.getSettings();
      
      if (!settings.apiKey || !settings.selectedBrandId) {
        console.error("Missing API key or brand space for agentic reply");
        return;
      }

      // Check if we've already replied to this tweet
      const repliedTweets = await chrome.storage.local.get("xthreads_replied_tweets");
      const repliedList = repliedTweets.xthreads_replied_tweets || [];
      
      if (repliedList.some(tweet => tweet.id === tweetData.id)) {
        console.log("Already replied to tweet:", tweetData.id);
        return;
      }

      // Generate reply using new API endpoint
      const response = await fetch('https://www.xthreads.app/api/ai-reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey
        },
        body: JSON.stringify({
          parentTweetContent: tweetData.content,
          prompt: `Reply to this tweet based on keywords: ${settings.keywords.join(', ')}`,
          brandId: settings.selectedBrandId,
          tone: settings.tone
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      let reply = data.reply || data.content;
      
      // Validate and truncate reply
      if (reply && reply.length > 280) {
        reply = reply.substring(0, 277) + '...';
      }

      if (reply) {
        // Send reply to content script for user review
        await chrome.tabs.sendMessage(tabId, {
          action: 'showAgenticReplyNotification',
          tweetData: tweetData,
          reply: reply
        });

        // Mark tweet as processed
        await this.markTweetAsReplied(tweetData.id);
        
        // Update stats
        await this.updateStats({ totalAttempts: 1 });
        
        console.log("Agentic reply generated for tweet:", tweetData.id);
      }

    } catch (error) {
      console.error("Failed to handle agentic reply request:", error);
      await this.updateStats({ totalAttempts: 1 }); // Count as failed attempt
    }
  }

  async markTweetAsReplied(tweetId) {
    try {
      const result = await chrome.storage.local.get("xthreads_replied_tweets");
      const repliedTweets = result.xthreads_replied_tweets || [];
      
      repliedTweets.push({
        id: tweetId,
        timestamp: Date.now()
      });
      
      await chrome.storage.local.set({
        xthreads_replied_tweets: repliedTweets
      });
    } catch (error) {
      console.error("Failed to mark tweet as replied:", error);
    }
  }

  isXUrl(url) {
    return url && (url.includes("x.com") || url.includes("twitter.com"));
  }

  async ensureContentScript(tabId) {
    try {
      // Check if content script is already injected
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.__xthreads_injected__ === true,
      });

      if (!results[0]?.result) {
        // Inject content script
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"],
        });

        await chrome.scripting.insertCSS({
          target: { tabId },
          files: ["content.css"],
        });

        console.log("Content script injected into tab:", tabId);
      }
    } catch (error) {
      console.error("Failed to inject content script:", error);
    }
  }

  setupCleanupSchedule() {
    // Clean up old data every 24 hours
    setInterval(async () => {
      await this.cleanupOldData();
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Initial cleanup after 5 seconds
    setTimeout(() => this.cleanupOldData(), 5000);
  }

  async cleanupOldData() {
    try {
      console.log("Running data cleanup...");

      // Clean up old replied tweets (older than 24 hours)
      const result = await chrome.storage.local.get("xthreads_replied_tweets");
      if (result.xthreads_replied_tweets) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
        const validTweets = result.xthreads_replied_tweets.filter(
          (tweet) => tweet.timestamp > cutoff
        );

        if (validTweets.length !== result.xthreads_replied_tweets.length) {
          await chrome.storage.local.set({
            xthreads_replied_tweets: validTweets,
          });
          console.log(
            `Cleaned up ${
              result.xthreads_replied_tweets.length - validTweets.length
            } old tweet records`
          );
        }
      }

      // Reset daily stats if it's a new day
      const lastResetResult = await chrome.storage.local.get("last_stats_reset");
      const today = new Date().toDateString();

      if (lastResetResult.last_stats_reset !== today) {
        await this.resetStats();
        await chrome.storage.local.set({ last_stats_reset: today });
        console.log("Daily stats reset");
      }
    } catch (error) {
      console.error("Cleanup failed:", error);
    }
  }
}

// Initialize background script
new XThreadsBackground();