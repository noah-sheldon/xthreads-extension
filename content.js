// Guard against multiple injections
if (!window.__xthreads_injected__) {
  window.__xthreads_injected__ = true;

  // Inject CSS for xThreads tweet buttons
  const style = document.createElement("style");
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
    
    .xthreads-toast {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      font-weight: 500;
      max-width: 350px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: slideInRight 0.3s ease-out;
    }
    
    .xthreads-toast-info {
      background: #00bcd4;
    }
    
    .xthreads-toast-success {
      background: #4CAF50;
    }
    
    .xthreads-toast-error {
      background: #f44336;
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
      console.log("xThreads Content Script initialized");
      this.setupMessageListener();
      this.loadRepliedTweets();

      // Wait for initial page load then start checking for tweet buttons
      setTimeout(() => {
        this.addTweetButtons();
        this.addRewriteButton();
        this.setupDOMObserver();
        this.checkMonitoringStatus();
      }, 2000);

      // Also check again after a longer delay for SPA navigation
      setTimeout(() => {
        this.addTweetButtons();
        this.addRewriteButton();
      }, 5000);

      // Listen for tab visibility changes
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          this.checkMonitoringStatus();
        }
      });
    }

    async checkMonitoringStatus() {
      try {
        // Check if monitoring should be active
        const result = await chrome.storage.local.get("xthreads_settings");
        const settings = result.xthreads_settings;

        if (settings && settings.isActive && settings.apiKey) {
          console.log("Resuming auto-monitoring on tab focus");
          this.startAgent(settings);
        }
      } catch (error) {
        console.log("Could not check monitoring status:", error);
      }
    }

    setupMessageListener() {
      chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
        switch (message.action) {
          case "startAgent":
            this.startAgent(message.settings);
            sendResponse({ success: true });
            break;

          case "stopAgent":
            this.stopAgent(message.manualStop);
            sendResponse({ success: true });
            break;

          case "openReplyTab":
            this.openReplyTab(message.tweetData);
            sendResponse({ success: true });
            break;

          case "scanForAgenticReplies":
            this.scanForAgenticReplies(message.settings);
            sendResponse({ success: true });
            break;

          case "showAgenticReplyNotification":
            this.showAgenticReplyNotification(message.tweetData, message.reply);
            sendResponse({ success: true });
            break;
        }
      });
    }

    setupDOMObserver() {
      const observer = new MutationObserver((mutations) => {
        let shouldCheckTweets = false;
        let shouldCheckComposer = false;

        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check for new tweets
              if (
                (node.querySelector &&
                  node.querySelector('[data-testid="tweet"]')) ||
                (node.matches && node.matches('[data-testid="tweet"]'))
              ) {
                shouldCheckTweets = true;
              }

              // Check for tweet actions (reply buttons)
              if (
                (node.querySelector &&
                  node.querySelector('[data-testid="reply"]')) ||
                (node.matches && node.matches('[data-testid="reply"]'))
              ) {
                shouldCheckTweets = true;
              }

              // Check for reply composer
              if (
                (node.querySelector &&
                  node.querySelector('[data-testid="tweetTextarea_0"]')) ||
                (node.matches &&
                  node.matches('[data-testid="tweetTextarea_0"]')) ||
                (node.querySelector &&
                  node.querySelector(
                    '[role="textbox"][contenteditable="true"]'
                  )) ||
                (node.matches &&
                  node.matches('[role="textbox"][contenteditable="true"]'))
              ) {
                shouldCheckComposer = true;
              }
            }
          });
        });

        if (shouldCheckTweets) {
          console.log("DOM changed, checking for tweets...");
          setTimeout(() => this.addTweetButtons(), 100);
        }

        if (shouldCheckComposer) {
          console.log("DOM changed, checking for composer...");
          setTimeout(() => this.addRewriteButton(), 100);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false, // Reduce observer overhead
      });

      // Also run periodically as a fallback
      setInterval(() => {
        this.addTweetButtons();
        this.addRewriteButton();
      }, 5000);

      // Make debugging function available globally
      window.xthreadsDebug = () => {
        console.log("=== xThreads Debug Info ===");
        console.log(
          "Composers found:",
          document.querySelectorAll(
            '[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"]'
          )
        );
        console.log(
          "Toolbars found:",
          document.querySelectorAll('[data-testid="toolBar"]')
        );
        console.log(
          "Tweet buttons found:",
          document.querySelectorAll(
            '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]'
          )
        );
        console.log(
          "Existing rewrite buttons:",
          document.querySelectorAll(".xthreads-rewrite-button")
        );
        console.log("Forms found:", document.querySelectorAll("form"));
        this.addRewriteButton();
        console.log("=== End Debug ===");
      };

      // Force add rewrite buttons immediately
      window.xthreadsForceRewrite = () => {
        console.log("🔧 Force adding rewrite buttons...");
        this.addRewriteButton();
      };

      // Add simple rewrite button to any form
      window.xthreadsAddSimpleButton = () => {
        console.log("🔧 Adding simple rewrite button to any form...");
        this.addSimpleRewriteButton();
      };
    }

    addTweetButtons() {
      console.log("Looking for tweets to add buttons...");

      // Find all tweets that don't already have xThreads buttons
      const tweets = document.querySelectorAll(
        '[data-testid="tweet"]:not(.xthreads-enhanced)'
      );
      console.log(`Found ${tweets.length} new tweets`);

      tweets.forEach((tweet) => {
        // Find the reply button container
        const replyButton = tweet.querySelector('[data-testid="reply"]');
        if (!replyButton) return;

        // Get the actions toolbar (parent of reply button)
        const actionsToolbar = replyButton.closest('[role="group"]');
        if (!actionsToolbar) return;

        // Mark as enhanced
        tweet.classList.add("xthreads-enhanced");

        // Extract tweet data
        const tweetData = this.extractTweetData(tweet);
        if (!tweetData) return;

        // Inject xThreads button next to reply
        this.injectTweetButton(actionsToolbar, replyButton, tweetData);
      });
    }

    injectTweetButton(actionsToolbar, replyButton, tweetData) {
      // Check if button already exists
      if (actionsToolbar.querySelector(".xthreads-tweet-button")) return;

      const button = document.createElement("div");
      button.className = "xthreads-tweet-button";
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
          <img src="${chrome.runtime.getURL("assets/icon16.png")}" 
               width="18" 
               height="18" 
               style="opacity: 0.6; transition: opacity 0.2s;" />
        </div>
      `;

      const buttonElement = button.querySelector('[role="button"]');

      // Hover effects
      buttonElement.addEventListener("mouseenter", () => {
        buttonElement.style.backgroundColor = "rgba(0, 188, 212, 0.1)";
        buttonElement.querySelector("img").style.opacity = "1";
      });

      buttonElement.addEventListener("mouseleave", () => {
        buttonElement.style.backgroundColor = "transparent";
        buttonElement.querySelector("img").style.opacity = "0.6";
      });

      // Click handler
      buttonElement.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openReplyWithTweetData(tweetData);
      });

      // Insert after reply button
      const replyContainer = replyButton.parentElement;
      replyContainer.parentNode.insertBefore(
        button,
        replyContainer.nextSibling
      );
    }

    addRewriteButton() {
      console.log("🔄 Looking for composers to add rewrite buttons...");

      // Remove any existing rewrite buttons first to prevent duplicates
      document
        .querySelectorAll(".xthreads-rewrite-button")
        .forEach((btn) => btn.remove());

      // Find all toolbars that might need rewrite buttons
      const toolbars = document.querySelectorAll('[data-testid="toolBar"]');
      console.log(`Found ${toolbars.length} toolbars to check`);

      let successfullyAdded = 0;
      const processedToolbars = new Set();

      toolbars.forEach((toolbar, index) => {
        // Skip if this toolbar already has a rewrite button or has been processed
        if (
          toolbar.querySelector(".xthreads-rewrite-button") ||
          processedToolbars.has(toolbar)
        ) {
          console.log(
            `Toolbar ${
              index + 1
            }: Already has rewrite button or already processed, skipping`
          );
          return;
        }

        // Look for a tweet button in this toolbar to confirm it's a composer toolbar
        const tweetButton = toolbar.querySelector(
          '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]'
        );
        if (!tweetButton) {
          console.log(
            `Toolbar ${
              index + 1
            }: No tweet button found, not a composer toolbar`
          );
          return;
        }

        console.log(
          `Toolbar ${index + 1}: Found tweet button, adding rewrite button...`
        );

        // Create rewrite button
        const rewriteButton = document.createElement("div");
        rewriteButton.className = "xthreads-rewrite-button";
        rewriteButton.innerHTML = `
          <div role="button" tabindex="0" style="
            min-height: 32px;
            min-width: auto;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 16px;
            transition: background-color 0.2s;
            cursor: pointer;
            padding: 6px 12px;
            margin-left: 8px;
            background-color: rgba(0, 188, 212, 0.1);
            border: 1px solid rgba(0, 188, 212, 0.3);
          " title="Rewrite with xThreads">
            <img src="${chrome.runtime.getURL("assets/icon16.png")}" 
                 width="16" 
                 height="16" 
                 style="opacity: 0.8; margin-right: 6px;" />
            <span style="color: #00bcd4; font-size: 13px; font-weight: 600;">Rewrite</span>
          </div>
        `;

        const buttonElement = rewriteButton.querySelector('[role="button"]');

        // Hover effects
        buttonElement.addEventListener("mouseenter", () => {
          buttonElement.style.backgroundColor = "rgba(0, 188, 212, 0.2)";
        });

        buttonElement.addEventListener("mouseleave", () => {
          buttonElement.style.backgroundColor = "rgba(0, 188, 212, 0.1)";
        });

        // Click handler - find the composer associated with this toolbar
        buttonElement.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();

          // Find the composer associated with this toolbar
          const composer = this.findComposerForToolbar(toolbar);
          console.log("Found composer for toolbar:", composer);
          this.handleRewriteContent(composer);
        });

        // Insert button before the tweet button
        tweetButton.parentNode.insertBefore(rewriteButton, tweetButton);
        processedToolbars.add(toolbar);
        successfullyAdded++;

        console.log(
          `✅ Successfully added rewrite button to toolbar ${index + 1}`
        );
      });

      console.log(`Successfully added ${successfullyAdded} rewrite buttons`);

      // Only run fallback if no toolbars were found
      if (successfullyAdded === 0) {
        console.log("No toolbars found, trying fallback approach...");
        this.addFallbackRewriteButtons();
      }
    }

    findComposerForToolbar(toolbar) {
      // Look for composer elements in the same container as the toolbar
      const container =
        toolbar.closest("form") ||
        toolbar.closest('[role="dialog"]') ||
        toolbar.parentElement;
      if (container) {
        const composer = container.querySelector(`
          [data-testid="tweetTextarea_0"],
          [role="textbox"][contenteditable="true"],
          [data-testid="tweetTextarea_1"],
          .public-DraftEditor-content[contenteditable="true"]
        `);
        if (composer) {
          return composer;
        }
      }

      // Fallback: look globally for any visible composer
      return document.querySelector(`
        [data-testid="tweetTextarea_0"]:not([style*="display: none"]),
        [role="textbox"][contenteditable="true"]:not([style*="display: none"])
      `);
    }

    tryAddButtonToComposer(composer, index) {
      try {
        // Try multiple ways to find the container and toolbar
        let composerContainer =
          composer.closest('[data-testid="toolBar"]') &&
          composer.closest('[data-testid="toolBar"]').parentElement;
        if (!composerContainer) {
          composerContainer = composer.closest("form");
        }
        if (!composerContainer) {
          composerContainer = composer.closest('[role="dialog"]');
        }
        if (!composerContainer) {
          // Look for parent elements that might contain the toolbar
          let current = composer.parentElement;
          let depth = 0;
          while (current && depth < 10) {
            if (current.querySelector('[data-testid="toolBar"]')) {
              composerContainer = current;
              break;
            }
            current = current.parentElement;
            depth++;
          }
        }

        if (!composerContainer) {
          console.log(`No container found for composer ${index + 1}`);
          return;
        }

        console.log(
          `Found container for composer ${index + 1}:`,
          composerContainer
        );
        composerContainer.classList.add("xthreads-composer-enhanced");

        // Find toolbar area (where tweet button is) - try multiple selectors
        let toolbar = composerContainer.querySelector(
          '[data-testid="toolBar"]'
        );
        if (!toolbar) {
          toolbar = composerContainer.querySelector('[role="group"]');
        }
        if (!toolbar) {
          // Look for elements containing tweet button
          const tweetButton = composerContainer.querySelector(
            '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]'
          );
          if (tweetButton) {
            toolbar =
              tweetButton.closest('[role="group"]') ||
              tweetButton.parentElement;
          }
        }

        if (!toolbar) {
          console.log(`No toolbar found for composer ${index + 1}`);
          return;
        }

        console.log(`Found toolbar for composer ${index + 1}:`, toolbar);

        // Create rewrite button
        const rewriteButton = document.createElement("div");
        rewriteButton.className = "xthreads-rewrite-button";
        rewriteButton.innerHTML = `
          <div role="button" tabindex="0" style="
            min-height: 32px;
            min-width: auto;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 16px;
            transition: background-color 0.2s;
            cursor: pointer;
            padding: 6px 12px;
            margin-left: 8px;
            background-color: rgba(0, 188, 212, 0.1);
            border: 1px solid rgba(0, 188, 212, 0.3);
          " title="Rewrite with xThreads">
            <img src="${chrome.runtime.getURL("assets/icon16.png")}" 
                 width="16" 
                 height="16" 
                 style="opacity: 0.8; margin-right: 6px;" />
            <span style="color: #00bcd4; font-size: 13px; font-weight: 600;">Rewrite</span>
          </div>
        `;

        const buttonElement = rewriteButton.querySelector('[role="button"]');

        // Hover effects
        buttonElement.addEventListener("mouseenter", () => {
          buttonElement.style.backgroundColor = "rgba(0, 188, 212, 0.2)";
        });

        buttonElement.addEventListener("mouseleave", () => {
          buttonElement.style.backgroundColor = "rgba(0, 188, 212, 0.1)";
        });

        // Click handler
        buttonElement.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.handleRewriteContent(composer);
        });

        // Insert button in toolbar (before the Tweet button)
        const tweetButton = toolbar.querySelector(
          '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]'
        );
        if (tweetButton) {
          console.log(`Found tweet button, inserting rewrite button before it`);
          tweetButton.parentNode.insertBefore(rewriteButton, tweetButton);
        } else {
          console.log(
            `No tweet button found, appending rewrite button to toolbar`
          );
          toolbar.appendChild(rewriteButton);
        }

        console.log(
          `✅ Successfully added rewrite button to composer ${index + 1}`
        );
        return true;
      } catch (error) {
        console.error(
          `❌ Error adding button to composer ${index + 1}:`,
          error
        );
        return false;
      }
    }

    addFallbackRewriteButtons() {
      console.log("🔧 Adding fallback rewrite buttons near tweet buttons...");
      const tweetButtons = document.querySelectorAll(
        '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]'
      );
      console.log(`Found ${tweetButtons.length} tweet buttons for fallback`);

      tweetButtons.forEach((tweetButton, index) => {
        if (
          tweetButton.parentElement &&
          !tweetButton.parentElement.querySelector(".xthreads-rewrite-button")
        ) {
          console.log(
            `Adding fallback rewrite button near tweet button ${index + 1}`
          );

          const rewriteButton = document.createElement("div");
          rewriteButton.className = "xthreads-rewrite-button";
          rewriteButton.innerHTML = `
            <div role="button" tabindex="0" style="
              min-height: 32px;
              min-width: auto;
              display: flex;
              align-items: center;
              justify-content: center;
              border-radius: 16px;
              transition: background-color 0.2s;
              cursor: pointer;
              padding: 6px 12px;
              margin-right: 8px;
              background-color: rgba(0, 188, 212, 0.1);
              border: 1px solid rgba(0, 188, 212, 0.3);
            " title="Rewrite with xThreads">
              <img src="${chrome.runtime.getURL("assets/icon16.png")}" 
                   width="16" 
                   height="16" 
                   style="opacity: 0.8; margin-right: 6px;" />
              <span style="color: #00bcd4; font-size: 13px; font-weight: 600;">Rewrite</span>
            </div>
          `;

          const buttonElement = rewriteButton.querySelector('[role="button"]');

          buttonElement.addEventListener("mouseenter", () => {
            buttonElement.style.backgroundColor = "rgba(0, 188, 212, 0.2)";
          });

          buttonElement.addEventListener("mouseleave", () => {
            buttonElement.style.backgroundColor = "rgba(0, 188, 212, 0.1)";
          });

          buttonElement.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Find nearest composer with multiple strategies
            let nearestComposer = null;

            // Strategy 1: Look in the same form
            const form = tweetButton.closest("form");
            if (form) {
              nearestComposer = form.querySelector(
                '[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], .public-DraftEditor-content[contenteditable="true"]'
              );
            }

            // Strategy 2: Look in the same dialog/modal
            if (!nearestComposer) {
              const dialog = tweetButton.closest('[role="dialog"]');
              if (dialog) {
                nearestComposer = dialog.querySelector(
                  '[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], .public-DraftEditor-content[contenteditable="true"]'
                );
              }
            }

            // Strategy 3: Look globally
            if (!nearestComposer) {
              nearestComposer = document.querySelector(
                '[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], .public-DraftEditor-content[contenteditable="true"]'
              );
            }

            // Strategy 4: Use the parent element as composer (fallback)
            if (!nearestComposer) {
              nearestComposer =
                tweetButton.closest("form") ||
                tweetButton.closest('[role="dialog"]');
            }

            console.log("Found composer for rewrite:", nearestComposer);

            // Always try to rewrite - even if no specific composer found
            // The function will use alternative content detection
            this.handleRewriteContent(nearestComposer);
          });

          tweetButton.parentNode.insertBefore(rewriteButton, tweetButton);
          console.log(`✅ Added fallback rewrite button ${index + 1}`);
        }
      });
    }

    async handleRewriteContent(composer) {
      try {
        console.log("🔄 Starting rewrite process with composer:", composer);

        // Get current content from composer
        const currentContent = this.getComposerContent(composer);
        console.log("📝 Extracted content:", currentContent);

        if (!currentContent || currentContent.trim().length === 0) {
          console.log("❌ No content found, showing error");
          this.showToast("Please enter some content to rewrite", "error");

          // Try alternative content detection
          console.log("🔍 Trying alternative content detection...");
          const alternativeContent = this.getAlternativeContent();
          console.log("🔍 Alternative content found:", alternativeContent);

          if (alternativeContent && alternativeContent.trim().length > 0) {
            console.log("✅ Using alternative content");
            // Use the alternative content
            this.processRewriteRequest(alternativeContent);
          }
          return;
        }

        this.processRewriteRequest(currentContent);
      } catch (error) {
        console.error("❌ Failed to handle rewrite content:", error);
        this.showToast("Failed to rewrite content. Please try again.", "error");
      }
    }

    async processRewriteRequest(content) {
      try {
        console.log("📤 Processing rewrite request for content:", content);

        // Get settings
        const settings = await this.getSettings();
        if (!settings.apiKey || !settings.selectedBrandId) {
          this.showToast(
            "Please configure your API key and brand in settings",
            "error"
          );
          return;
        }

        // Show loading state
        this.showToast("Rewriting content...", "info");

        // Call rewrite API
        const response = await fetch(
          "https://www.xthreads.app/api/rewrite-content",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": settings.apiKey,
            },
            body: JSON.stringify({
              originalContent: content,
              brandId: settings.selectedBrandId,
              tone: settings.tone || "professional",
            }),
          }
        );

        console.log("📡 API Response status:", response.status);

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        console.log("📡 API Response data:", data);

        // Handle both string and array responses
        let rewrittenContent = data.rewrittenContent;
        if (Array.isArray(rewrittenContent) && rewrittenContent.length > 0) {
          rewrittenContent = rewrittenContent[0]; // Use first variation
        }

        if (rewrittenContent && typeof rewrittenContent === "string") {
          console.log("✅ Content rewritten, showing in popup rewrite tab...");

          // Store rewrite data for popup display
          await chrome.storage.local.set({
            xthreads_rewrite_data: {
              originalContent: content,
              rewrittenContent: rewrittenContent,
              tone: settings.tone || "professional",
              timestamp: Date.now(),
            },
          });

          this.showToast("Content rewritten! Opening popup...", "success");

          // Open popup to rewrite tab
          try {
            chrome.runtime.sendMessage({
              action: "openPopupToRewriteTab",
            });
          } catch (error) {
            console.log("Could not send message to background:", error);
          }

          // Show popup indicator as fallback
          this.showOpenRewritePopupIndicator();
        } else {
          throw new Error("No rewritten content received");
        }
      } catch (error) {
        console.error("❌ Failed to rewrite content:", error);
        this.showToast("Failed to rewrite content. Please try again.", "error");
      }
    }

    getAlternativeContent() {
      console.log("🔍 Trying alternative content detection methods...");

      // Strategy 1: Look for any focused text input
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === "TEXTAREA" ||
          activeElement.contentEditable === "true")
      ) {
        const content =
          activeElement.value ||
          activeElement.textContent ||
          activeElement.innerText;
        if (content && content.trim()) {
          console.log("📝 Found content in active element:", content);
          return content;
        }
      }

      // Strategy 2: Look for visible tweet composer
      const visibleComposers = document.querySelectorAll(`
        [data-testid="tweetTextarea_0"]:not([style*="display: none"]),
        [role="textbox"][contenteditable="true"]:not([style*="display: none"]),
        .public-DraftEditor-content[contenteditable="true"]:not([style*="display: none"])
      `);

      for (const composer of visibleComposers) {
        const content =
          composer.value || composer.textContent || composer.innerText;
        if (content && content.trim()) {
          console.log("📝 Found content in visible composer:", content);
          return content;
        }
      }

      // Strategy 3: Look for any text in reply/compose area
      const forms = document.querySelectorAll("form");
      for (const form of forms) {
        const textElements = form.querySelectorAll(
          'textarea, [contenteditable="true"]'
        );
        for (const element of textElements) {
          const content =
            element.value || element.textContent || element.innerText;
          if (content && content.trim() && content.length > 5) {
            console.log("📝 Found content in form text element:", content);
            return content;
          }
        }
      }

      console.log("❌ No alternative content found");
      return null;
    }

    addSimpleRewriteButton() {
      console.log("🔧 Adding simple rewrite button...");

      // Remove any existing simple buttons
      document
        .querySelectorAll(".xthreads-simple-rewrite")
        .forEach((btn) => btn.remove());

      // Find any form on the page
      const forms = document.querySelectorAll("form");
      console.log(`Found ${forms.length} forms`);

      if (forms.length > 0) {
        const form = forms[0]; // Use first form

        const simpleButton = document.createElement("div");
        simpleButton.className = "xthreads-simple-rewrite";
        simpleButton.innerHTML = `
          <button style="
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
            background: #00bcd4;
            color: white;
            border: none;
            border-radius: 6px;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          ">
            🔄 Rewrite
          </button>
        `;

        const button = simpleButton.querySelector("button");
        button.addEventListener("click", () => {
          this.handleRewriteContent(null);
        });

        form.appendChild(simpleButton);
        console.log("✅ Added simple floating rewrite button");

        return true;
      }

      console.log("❌ No forms found for simple button");
      return false;
    }

    getComposerContent(composer) {
      console.log("Getting content from composer:", composer);

      if (composer && composer.tagName === "TEXTAREA") {
        const content = composer.value;
        console.log("Textarea content:", content);
        return content;
      } else if (
        composer &&
        (composer.contentEditable === "true" || composer.isContentEditable)
      ) {
        const content = composer.textContent || composer.innerText;
        console.log("ContentEditable content:", content);
        return content;
      } else {
        // Try to find the actual text content in the composer area
        const textContainer = composer
          ? composer.closest("form") || composer.closest('[role="dialog"]')
          : document;

        // Look for various text content selectors
        const textElements = textContainer.querySelectorAll(`
          [data-testid="tweetTextarea_0"],
          [role="textbox"][contenteditable="true"],
          .public-DraftEditor-content,
          .DraftEditor-editorContainer [contenteditable="true"],
          [data-text="true"]
        `);

        for (const element of textElements) {
          const content =
            element.textContent || element.innerText || element.value;
          if (content && content.trim()) {
            console.log(
              "Found content in element:",
              element,
              "Content:",
              content
            );
            return content;
          }
        }

        // Last resort: try to get all text from the form area
        const formContent =
          textContainer.textContent || textContainer.innerText;
        console.log("Form area content:", formContent);

        // Filter out button text and UI elements
        if (formContent) {
          const lines = formContent.split("\n").filter((line) => {
            const trimmed = line.trim();
            return (
              trimmed &&
              !trimmed.includes("Tweet") &&
              !trimmed.includes("Reply") &&
              !trimmed.includes("Rewrite") &&
              !trimmed.includes("Add photos or video") &&
              trimmed.length > 5
            ); // Ignore very short lines
          });

          const content = lines.join(" ").trim();
          console.log("Filtered content:", content);
          return content;
        }
      }
      return "";
    }

    openReplyWithTweetData(tweetData) {
      // Store tweet data for popup to access
      chrome.storage.local.set({
        xthreads_current_tweet: {
          ...tweetData,
          timestamp: Date.now(),
        },
      });

      // Show visual indicator since we can't reliably open popup programmatically
      this.showOpenPopupIndicator();

      // Also try background script approach as fallback
      chrome.runtime.sendMessage({
        action: "openPopupToReplyTab",
        tweetData: tweetData,
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

      console.log(
        "🚀 xThreads Agent started - One-time comprehensive scan for 10 opportunities"
      );

      // Clear previous opportunities when starting new scan
      this.batchOpportunities = [];
      this.storeBatchOpportunities();

      // Start comprehensive scan immediately
      setTimeout(() => this.performComprehensiveScan(), 2000);
    }

    stopAgent(manualStop = false) {
      this.isActive = false;

      // Clear scanning interval if exists
      if (this.scanInterval) {
        clearInterval(this.scanInterval);
        this.scanInterval = null;
      }

      if (manualStop) {
        console.log("🛑 xThreads Agent manually stopped - processing collected opportunities...");
        // If manually stopped, immediately process whatever we have collected
        this.processCollectedOpportunities();
      } else {
        console.log("🛑 xThreads Agent stopped");
      }
    }
    
    async processCollectedOpportunities() {
      try {
        console.log(`📊 Processing ${this.batchOpportunities.length} collected opportunities...`);
        
        if (this.batchOpportunities.length > 0) {
          // Sort by weight and take top 30
          this.batchOpportunities.sort((a, b) => b.weight - a.weight);
          const top30 = this.batchOpportunities.slice(0, 30);
          
          // Update batch with top 30 and clear replies
          this.batchOpportunities = top30.map(opp => ({
            ...opp,
            reply: null,
            foundAt: Date.now(),
            source: "manual stop"
          }));
          
          await this.storeBatchOpportunities();
          await this.stopAgentAndGenerateReplies(this.batchOpportunities);
        } else {
          // No opportunities collected
          await this.stopAgentAndGenerateReplies([]);
        }
      } catch (error) {
        console.error("Error processing collected opportunities:", error);
        await this.stopAgentAndGenerateReplies([]);
      }
    }

    async performComprehensiveScan() {
      if (!this.isActive || !this.settings) return;

      const targetViralTweets = 10;
      console.log(
        `🔍 Starting viral tweet hunt - target: ${targetViralTweets} viral tweets (weight > 2.0)...`
      );

      try {
        // Hunt for viral tweets with intelligent scrolling
        await this.huntForViralTweets(targetViralTweets);

        // Complete scan and turn off agent
        return this.completeScan();
      } catch (error) {
        console.error("❌ Viral hunt failed:", error);
        this.completeScan();
      }
    }

    async scanCurrentPageWithDeepScroll() {
      const maxOpportunities = 10;
      let foundTotal = 0;

      try {
        console.log("📄 Starting deep scroll scan (10 scrolls)...");

        // Deep auto-scroll to load more tweets (10 scrolls)
        for (
          let i = 0;
          i < 10 && this.batchOpportunities.length < maxOpportunities;
          i++
        ) {
          console.log(
            `📜 Scroll ${i + 1}/10... (current opportunities: ${
              this.batchOpportunities.length
            }/${maxOpportunities})`
          );

          // Check if we've reached the limit before scrolling
          if (this.batchOpportunities.length >= maxOpportunities) {
            console.log(
              `🛑 Reached ${maxOpportunities} opportunities limit, stopping scan`
            );
            break;
          }

          window.scrollTo(0, document.body.scrollHeight);
          await this.sleep(2000); // Wait for new tweets to load

          // Scan new tweets after each scroll
          const newTweets = await this.scanNewTweetsOnPage();
          foundTotal += newTweets;

          if (newTweets > 0) {
            console.log(
              `🎯 Found ${newTweets} new opportunities after scroll ${
                i + 1
              } (total: ${this.batchOpportunities.length})`
            );
          }

          // Double-check limit after scanning
          if (this.batchOpportunities.length >= maxOpportunities) {
            console.log(
              `🛑 Reached ${maxOpportunities} opportunities after scanning, stopping`
            );
            break;
          }
        }

        console.log(
          `📊 Deep scroll complete: Found ${foundTotal} total opportunities`
        );
        return foundTotal;
      } catch (error) {
        console.error("Failed to perform deep scroll scan:", error);
        return foundTotal;
      }
    }

    async huntForViralTweets(targetViralTweets) {
      const maxScrolls = 10; // Reduced scrolls
      let allOpportunities = []; // Collect all opportunities
      let scrollCount = 0;
      let lastTweetCount = 0;
      let processedTweetIds = new Set(); // Track processed tweets to avoid duplicates

      try {
        console.log(
          `🔥 Starting opportunity collection: scanning for highest weight tweets`
        );

        // Initial scan of current page
        const initialOpportunities = await this.collectOpportunitiesFromPage(
          processedTweetIds
        );
        allOpportunities = allOpportunities.concat(initialOpportunities);
        console.log(
          `🎯 Initial scan: Found ${initialOpportunities.length} opportunities`
        );

        // Continue scrolling to collect more opportunities
        while (scrollCount < maxScrolls && this.isActive) {
          scrollCount++;
          console.log(
            `📜 Scroll ${scrollCount}/${maxScrolls}... Collected ${allOpportunities.length} opportunities so far...`
          );

          // Scroll to load more content
          const beforeScroll = document.body.scrollHeight;
          window.scrollTo(0, document.body.scrollHeight);
          await this.sleep(2000); // Wait for new tweets to load

          // Check if new content loaded
          const afterScroll = document.body.scrollHeight;
          const currentTweetCount = document.querySelectorAll(
            '[data-testid="tweet"]'
          ).length;

          if (
            afterScroll === beforeScroll &&
            currentTweetCount === lastTweetCount
          ) {
            console.log(
              `📄 No new content loaded after scroll ${scrollCount}, might have reached end`
            );
            // Try one more scroll before giving up
            if (scrollCount > 3) {
              console.log(
                `🛑 No new content for several scrolls, ending collection with ${allOpportunities.length} opportunities`
              );
              break;
            }
          }

          lastTweetCount = currentTweetCount;

          // Collect new opportunities from this scroll
          const newOpportunities = await this.collectOpportunitiesFromPage(
            processedTweetIds
          );
          allOpportunities = allOpportunities.concat(newOpportunities);

          if (newOpportunities.length > 0) {
            console.log(
              `📈 Found ${newOpportunities.length} new opportunities! Total: ${allOpportunities.length}`
            );
          }
        }

        // Sort all opportunities by weight (highest first) and take top 30
        allOpportunities.sort((a, b) => b.weight - a.weight);
        const top30Opportunities = allOpportunities.slice(0, 30);

        console.log(
          `🏆 Selected top ${top30Opportunities.length} opportunities by weight:`
        );
        top30Opportunities.forEach((opp, i) => {
          console.log(
            `${i + 1}. Weight: ${opp.weight.toFixed(
              2
            )} - "${opp.content.substring(0, 50)}..."`
          );
        });

        // Store opportunities without replies first
        this.batchOpportunities = top30Opportunities.map(opp => ({
          ...opp,
          reply: null, // No replies yet
          foundAt: Date.now(),
          source: "viral hunt"
        }));
        
        await this.storeBatchOpportunities();
        
        // NOW stop the agent and update UI
        console.log(`🛑 Scanning complete! Agent stopping, beginning reply generation...`);
        await this.stopAgentAndGenerateReplies(top30Opportunities);
        
        return top30Opportunities.length;
      } catch (error) {
        console.error("Error during opportunity collection:", error);
        // Stop agent even on error
        await this.stopAgentAndGenerateReplies([]);
        return 0;
      }
    }
    
    async stopAgentAndGenerateReplies(opportunities) {
      try {
        // 1. Stop the agent immediately
        this.isActive = false;
        
        // 2. Update settings to reflect agent is off
        if (this.settings) {
          this.settings.isActive = false;
          // Notify background to update settings
          chrome.runtime.sendMessage({
            action: 'saveSettings',
            settings: this.settings
          });
        }
        
        // 3. Notify popup that agent has stopped
        chrome.runtime.sendMessage({
          action: 'agentStopped',
          opportunitiesFound: opportunities.length
        });
        
        console.log(`🔄 Content: Starting reply generation for ${opportunities.length} opportunities...`);
        
        // 4. Generate replies for top opportunities
        let requestCount = 0;
        for (const opportunity of opportunities) {
          try {
            requestCount++;
            // Send request to background script for reply generation
            console.log(
              `🔄 Content: Sending request ${requestCount}/${opportunities.length} for tweet: ${opportunity.id}`
            );
            chrome.runtime.sendMessage({
              action: "agenticReplyRequest",
              tweetData: opportunity,
            });
          } catch (error) {
            console.error(
              `❌ Content: Failed to request reply for ${opportunity.id}:`,
              error
            );
          }
        }
        
        console.log(`✅ Content: Sent ${requestCount} reply requests to background script`);
        
        // Add timeout to catch any requests that never get processed
        setTimeout(async () => {
          console.log(`⏰ Content: Checking for any unprocessed requests after 30 seconds...`);
          await this.ensureAllRepliesProcessed();
        }, 30000); // 30 second timeout

        console.log(
          `🏆 Successfully queued ${opportunities.length} high-value opportunities for reply generation`
        );
      } catch (error) {
        console.error("Error in stopAgentAndGenerateReplies:", error);
      }
    }
    
    async ensureAllRepliesProcessed() {
      try {
        console.log(`🔍 Content: Checking for unprocessed replies...`);
        
        // Get current opportunities from storage
        const result = await chrome.storage.local.get('xthreads_batch_opportunities');
        const opportunities = result.xthreads_batch_opportunities || [];
        
        // Find any opportunities that still have null replies
        const unprocessedOpportunities = opportunities.filter(opp => 
          opp.reply === null || opp.reply === undefined
        );
        
        if (unprocessedOpportunities.length > 0) {
          console.log(`⚠️ Content: Found ${unprocessedOpportunities.length} unprocessed replies, setting to "No reply"`);
          
          // Update all unprocessed opportunities to "No reply"
          const updatedOpportunities = opportunities.map(opp => {
            if (opp.reply === null || opp.reply === undefined) {
              console.log(`🔧 Content: Setting "No reply" for tweet ${opp.id}`);
              return { ...opp, reply: "No reply" };
            }
            return opp;
          });
          
          // Save updated opportunities back to storage
          await chrome.storage.local.set({
            xthreads_batch_opportunities: updatedOpportunities
          });
          
          console.log(`✅ Content: Updated ${unprocessedOpportunities.length} unprocessed replies to "No reply"`);
        } else {
          console.log(`✅ Content: All replies have been processed successfully`);
        }
      } catch (error) {
        console.error(`❌ Content: Failed to ensure replies processed:`, error);
      }
    }

    async collectOpportunitiesFromPage(processedTweetIds) {
      const opportunities = [];
      const tweets = document.querySelectorAll('[data-testid="tweet"]');

      for (const tweet of tweets) {
        try {
          // Extract tweet content and metadata
          const tweetData = this.extractTweetData(tweet);
          if (!tweetData || !tweetData.content || !tweetData.id) continue;

          // Check for duplicates
          if (processedTweetIds.has(tweetData.id)) {
            continue; // Skip if already processed
          }

          processedTweetIds.add(tweetData.id);

          // Check if this is a valid growth opportunity
          if (this.isGrowthOpportunity(tweetData, this.settings)) {
            // Add weight to tweetData (already calculated in isGrowthOpportunity)
            opportunities.push(tweetData);
            console.log(
              `✅ Added opportunity: Weight ${tweetData.weight.toFixed(
                2
              )} - "${tweetData.content.substring(0, 50)}..."`
            );
          }
        } catch (error) {
          console.error("Error processing tweet for opportunity:", error);
        }
      }

      return opportunities;
    }

    async scanForViralTweetsOnly(processedTweetIds, viralThreshold) {
      let viralTweetsFound = 0;

      try {
        const tweets = document.querySelectorAll('[data-testid="tweet"]');
        let candidateTweets = []; // Collect viral tweets only

        // Phase 1: Find new viral tweets
        for (const tweet of tweets) {
          const tweetData = this.extractTweetData(tweet);

          if (tweetData && !processedTweetIds.has(tweetData.id)) {
            processedTweetIds.add(tweetData.id); // Mark as processed

            if (this.isGrowthOpportunity(tweetData, this.settings)) {
              // Only consider tweets that meet viral threshold
              if (tweetData.weight >= viralThreshold) {
                candidateTweets.push(tweetData);
                console.log(
                  `🔥 VIRAL CANDIDATE: ${tweetData.content.substring(
                    0,
                    50
                  )}... (weight: ${tweetData.weight.toFixed(2)})`
                );
              }
            }
          }
        }

        // Phase 2: Sort viral tweets by weight and generate replies
        candidateTweets.sort((a, b) => b.weight - a.weight);

        for (const tweetData of candidateTweets) {
          // Check if we already have this in storage
          const existsInBatch = this.batchOpportunities.some(
            (op) => op.id === tweetData.id
          );
          const existsInStorage = await this.checkIfTweetProcessed(
            tweetData.id
          );

          if (!existsInBatch && !existsInStorage) {
            console.log(
              `🔄 Generating reply for viral tweet (${tweetData.weight.toFixed(
                2
              )}): ${tweetData.id}`
            );
            const reply = await this.generateReplyForTweet(tweetData);

            if (reply) {
              const opportunity = {
                ...tweetData,
                reply: reply,
                foundAt: Date.now(),
                source: "viral hunt",
                weight: tweetData.weight,
                isViral: true, // Mark as viral for UI display
              };

              this.batchOpportunities.push(opportunity);
              viralTweetsFound++;

              // Store immediately and update UI
              await this.storeBatchOpportunities();
              this.sendLiveUpdate();

              console.log(
                `🎉 Viral opportunity #${
                  this.batchOpportunities.length
                } added (weight: ${tweetData.weight.toFixed(2)})`
              );
            }
          }
        }

        return viralTweetsFound;
      } catch (error) {
        console.error("Error scanning for viral tweets:", error);
        return viralTweetsFound;
      }
    }

    async scanNewTweetsOnPage() {
      const maxOpportunities = 30; // Updated to collect top 30
      let foundOnThisPass = 0;

      try {
        const tweets = document.querySelectorAll('[data-testid="tweet"]');
        let candidateTweets = []; // Collect all qualifying tweets with weights

        console.log(
          `🔍 Analyzing ${tweets.length} tweets for weight-based selection...`
        );

        // Phase 1: Collect all qualifying tweets with weights
        for (const tweet of tweets) {
          const tweetData = this.extractTweetData(tweet);

          if (tweetData && this.isGrowthOpportunity(tweetData, this.settings)) {
            // Check if we already have this opportunity
            const existsInBatch = this.batchOpportunities.some(
              (op) => op.id === tweetData.id
            );
            const existsInStorage = await this.checkIfTweetProcessed(
              tweetData.id
            );

            if (!existsInBatch && !existsInStorage) {
              candidateTweets.push(tweetData); // tweetData now has weight attached
              console.log(
                `📊 Candidate: ${tweetData.content.substring(
                  0,
                  50
                )}... (weight: ${tweetData.weight.toFixed(2)})`
              );
            }
          }
        }

        // Phase 2: Sort by weight (highest first) and take top candidates
        candidateTweets.sort((a, b) => b.weight - a.weight);
        const remainingSlots =
          maxOpportunities - this.batchOpportunities.length;
        const topCandidates = candidateTweets.slice(0, remainingSlots);

        console.log(
          `🏆 Top ${topCandidates.length} tweets by weight (of ${candidateTweets.length} candidates):`
        );
        topCandidates.forEach((tweet, i) => {
          console.log(
            `  ${i + 1}. Weight: ${tweet.weight.toFixed(
              2
            )} - "${tweet.content.substring(0, 60)}..."`
          );
        });

        // Phase 3: Collect top weighted tweets (NO reply generation during scan)
        for (const tweetData of topCandidates) {
          console.log(
            `🎯 Collecting high-weight tweet (${tweetData.weight.toFixed(
              2
            )}): ${tweetData.id}`
          );

          const opportunity = {
            ...tweetData,
            reply: null, // Will be generated AFTER scanning completes
            foundAt: Date.now(),
            source: "current page",
            weight: tweetData.weight, // Preserve weight for display
          };

          this.batchOpportunities.push(opportunity);
          foundOnThisPass++;

          console.log(
            `🎯 High-weight opportunity ${
              this.batchOpportunities.length
            }/${maxOpportunities} collected (weight: ${tweetData.weight.toFixed(
              2
            )})`
          );
        }

        // Store collected opportunities (without replies)
        if (foundOnThisPass > 0) {
          await this.storeBatchOpportunities();
          this.sendLiveUpdate();
          console.log(
            `💾 Stored ${this.batchOpportunities.length} opportunities to storage`
          );
        }

        return foundOnThisPass;
      } catch (error) {
        console.error("Failed to scan new tweets:", error);
        return foundOnThisPass;
      }
    }

    async completeScan() {
      console.log(
        `🏁 Comprehensive scan completed! Found ${this.batchOpportunities.length} growth opportunities`
      );

      // Store all opportunities
      await this.storeBatchOpportunities();

      // Send final notification
      if (this.batchOpportunities.length > 0) {
        this.sendBatchNotification(true); // Mark as scan complete
      }

      // Notify popup that agent has stopped
      try {
        chrome.runtime.sendMessage({
          action: "agentStopped",
          reason: "scanComplete",
          opportunitiesFound: this.batchOpportunities.length,
        });
        console.log("📱 Sent agent stopped message to popup");
      } catch (error) {
        console.log("Could not notify popup of agent stop:", error);
      }

      // Properly stop agent (includes cleanup)
      this.stopAgent();

      console.log("🛑 Agent automatically stopped after comprehensive scan");
    }

    sendLiveUpdate() {
      // Send live update to background script for popup badge
      chrome.runtime.sendMessage({
        action: "liveOpportunityUpdate",
        count: this.batchOpportunities.length,
        opportunities: this.batchOpportunities.slice(-3), // Send last 3 for preview
      });
    }

    async scanForAgenticReplies(settings) {
      // This method is called from popup for manual refresh - now uses comprehensive scan
      this.settings = settings;
      await this.performComprehensiveScan();
    }

    async generateReplyForTweet(tweetData) {
      if (
        !this.settings ||
        !this.settings.apiKey ||
        !this.settings.selectedBrandId
      ) {
        console.log("Missing API key or brand ID for reply generation");
        return null;
      }

      try {
        // Send request to background script for reply generation
        console.log(
          "🔄 Requesting reply generation via background script for:",
          tweetData.id
        );

        // Use background script to handle API call (avoids CORS issues)
        chrome.runtime.sendMessage({
          action: "agenticReplyRequest",
          tweetData: tweetData,
        });

        // Return placeholder - actual reply will come via showAgenticReplyNotification
        return "Reply being generated...";
      } catch (error) {
        console.error("Failed to request reply generation:", error);
        return null;
      }
    }

    async sendBatchNotification(scanComplete = false) {
      const count = this.batchOpportunities.length;
      if (count === 0) return;

      this.lastNotificationTime = Date.now();

      // Send message to background script for notification
      chrome.runtime.sendMessage({
        action: "showBatchNotification",
        count: count,
        opportunities: this.batchOpportunities.slice(0, 5), // Send first 5 for preview
        scanComplete: scanComplete,
      });

      console.log(
        `📢 Sent batch notification for ${count} opportunities${
          scanComplete ? " (scan complete)" : ""
        }`
      );
    }

    async storeBatchOpportunities() {
      try {
        await chrome.storage.local.set({
          xthreads_batch_opportunities: this.batchOpportunities,
        });
      } catch (error) {
        console.error("Failed to store batch opportunities:", error);
      }
    }

    async checkIfTweetProcessed(tweetId) {
      try {
        // Check if tweet exists in stored opportunities
        const result = await chrome.storage.local.get(
          "xthreads_batch_opportunities"
        );
        const storedOpportunities = result.xthreads_batch_opportunities || [];

        const alreadyProcessed = storedOpportunities.some(
          (op) => op.id === tweetId
        );

        if (alreadyProcessed) {
          console.log(`⏭️  Tweet ${tweetId} already processed, skipping`);
          return true;
        }

        return false;
      } catch (error) {
        console.error("Failed to check if tweet processed:", error);
        return false; // If we can't check, allow processing
      }
    }

    extractTweetData(tweetElement) {
      try {
        const textElement = tweetElement.querySelector(
          '[data-testid="tweetText"]'
        );
        const linkElement = tweetElement.querySelector('a[href*="/status/"]');
        const timeElement = tweetElement.querySelector("time");

        if (!textElement || !linkElement) return null;

        const content = textElement.textContent.trim();
        const tweetUrl = linkElement.href;
        const tweetId = tweetUrl.match(/\/status\/(\d+)/)?.[1];
        const timestamp = timeElement
          ? new Date(timeElement.dateTime).getTime()
          : Date.now();

        return {
          id: tweetId,
          content: content,
          url: tweetUrl,
          timestamp: timestamp,
        };
      } catch (error) {
        console.error("Failed to extract tweet data:", error);
        return null;
      }
    }

    isGrowthOpportunity(tweetData, settings) {
      // Check if already replied
      if (this.repliedTweets.has(tweetData.id)) return false;

      // Filter out short posts (less than 20 characters)
      if (!tweetData.content || tweetData.content.trim().length < 20) {
        console.log(`❌ Tweet too short (${tweetData.content?.length || 0} chars): "${tweetData.content?.substring(0, 30) || 'empty'}..."`);
        return false;
      }

      // Check if tweet is recent (within last 4 hours for better growth potential)
      const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
      if (tweetData.timestamp < fourHoursAgo) return false;

      const content = tweetData.content.toLowerCase();
      const tweetElement = document
        .querySelector(`[href*="${tweetData.id}"]`)
        ?.closest('[data-testid="tweet"]');

      // Growth-focused engagement metrics with weight calculation
      const growthAnalysis = this.hasGrowthPotential(tweetElement, tweetData);
      if (!growthAnalysis.hasGrowth) return false;

      // Store weight for later sorting (attach to tweetData)
      tweetData.weight = growthAnalysis.weight;

      // Accept all tweets regardless of keywords for agentic reply
      console.log(`✅ Tweet accepted for agentic reply consideration (${tweetData.content.length} chars)`);
      return true;
    }

    hasGrowthPotential(tweetElement, tweetData = null) {
      if (!tweetElement) return { hasGrowth: true, weight: 1.0 }; // Default if we can't analyze

      try {
        // Extract engagement metrics
        const likeButton = tweetElement.querySelector('[data-testid="like"]');
        const replyButton = tweetElement.querySelector('[data-testid="reply"]');

        const likeCount = this.extractCount(
          likeButton ? likeButton.textContent : ""
        );
        const replyCount = this.extractCount(
          replyButton ? replyButton.textContent : ""
        );

        // Accept any engagement level, not oversaturated with replies
        const hasGoodEngagement = likeCount >= 1; // Any likes
        const notOversaturated = replyCount < 25; // Less competition

        // Calculate time-based weight using your formula
        const weight = this.calculateTweetWeight(likeCount, tweetData);

        console.log(
          `📊 Tweet engagement: ${likeCount} likes, ${replyCount} replies, weight: ${weight.toFixed(
            2
          )}`
        );

        return {
          hasGrowth: hasGoodEngagement && notOversaturated,
          weight: weight,
        };
      } catch (error) {
        console.log("Could not analyze engagement metrics, defaulting to true");
        return { hasGrowth: true, weight: 1.0 };
      }
    }

    calculateTweetWeight(likeCount, tweetData) {
      if (!tweetData || !tweetData.timestamp || likeCount === 0) {
        return 0.1; // Low weight for tweets with no engagement or timestamp
      }

      try {
        // Calculate time since tweet was posted
        const now = Date.now();
        const hoursOld = Math.max(
          (now - tweetData.timestamp) / (1000 * 60 * 60),
          0.1
        ); // Minimum 0.1 hours

        // Calculate growth rate (likes per hour)
        const likesPerHour = likeCount / hoursOld;

        // Base weight from growth rate
        let weight = likesPerHour / 10; // Normalize: 10 likes/hour = 1.0 weight

        // Viral threshold bonuses (exponential rewards for high growth)
        if (likesPerHour >= 100) {
          weight *= 5.0; // 🔥 Major viral (100+ likes/hr)
          console.log(
            `🔥🔥🔥 MAJOR VIRAL: ${likesPerHour.toFixed(1)} likes/hr`
          );
        } else if (likesPerHour >= 50) {
          weight *= 3.0; // 🔥 Strong viral (50+ likes/hr)
          console.log(`🔥🔥 STRONG VIRAL: ${likesPerHour.toFixed(1)} likes/hr`);
        } else if (likesPerHour >= 30) {
          weight *= 2.0; // 🔥 Viral potential (30+ likes/hr)
          console.log(
            `🔥 VIRAL POTENTIAL: ${likesPerHour.toFixed(1)} likes/hr`
          );
        } else if (likesPerHour >= 20) {
          weight *= 1.5; // 📈 High growth (20+ likes/hr)
          console.log(`📈 HIGH GROWTH: ${likesPerHour.toFixed(1)} likes/hr`);
        } else if (likesPerHour >= 10) {
          weight *= 1.0; // ✅ Good growth (10+ likes/hr) - baseline
          console.log(`✅ GOOD GROWTH: ${likesPerHour.toFixed(1)} likes/hr`);
        } else {
          weight *= 0.5; // 📉 Slow growth (<10 likes/hr)
          console.log(`📉 SLOW GROWTH: ${likesPerHour.toFixed(1)} likes/hr`);
        }

        // Freshness bonus for very new tweets (higher potential for growth)
        if (hoursOld < 0.5) {
          // Less than 30 minutes
          weight *= 1.3; // Fresh content bonus
          console.log(`⚡ FRESH CONTENT BONUS: ${hoursOld.toFixed(1)}hrs old`);
        } else if (hoursOld < 1.0) {
          // Less than 1 hour
          weight *= 1.1; // New content bonus
          console.log(`🆕 NEW CONTENT BONUS: ${hoursOld.toFixed(1)}hrs old`);
        }

        // Sustained viral bonus for older tweets with high rates (proven staying power)
        if (hoursOld >= 3.0 && likesPerHour >= 25) {
          weight *= 1.4; // Sustained viral growth
          console.log(
            `🏆 SUSTAINED VIRAL: ${hoursOld.toFixed(
              1
            )}hrs with ${likesPerHour.toFixed(1)} likes/hr`
          );
        }

        console.log(
          `⚖️  Tweet: ${likeCount} likes in ${hoursOld.toFixed(
            1
          )}hrs = ${likesPerHour.toFixed(
            1
          )} likes/hr → weight: ${weight.toFixed(2)}`
        );

        // Cap weight at reasonable bounds
        return Math.min(Math.max(weight, 0.1), 50.0); // Higher ceiling for viral content
      } catch (error) {
        console.log("Error calculating tweet weight:", error);
        return 0.1;
      }
    }

    extractCount(text) {
      if (!text) return 0;
      const match = text.match(/[\d,]+/);
      return match ? parseInt(match[0].replace(/,/g, "")) : 0;
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
        const matchingWords = keywordWords.filter((kw) =>
          words.some((word) => word.includes(kw) && kw.length > 2)
        );

        if (matchingWords.length > 0) {
          const partialScore = matchingWords.length;
          score += partialScore;
          console.log(
            `📈 +${partialScore} points: Partial matches for "${keyword}" (${matchingWords.join(
              ", "
            )})`
          );
        }

        // Context bonus: keyword appears in meaningful context
        if (this.isKeywordInContext(content, keywordLower)) {
          score += 1;
          console.log(`📈 +1 point: Contextual relevance for "${keyword}"`);
        }
      }

      // Tweet focus bonus: keywords make up significant portion of tweet
      const keywordDensity = this.calculateKeywordDensity(content, keywords);
      if (keywordDensity > 0.2) {
        // 20%+ of tweet is about keywords
        score += 2;
        console.log(
          `📈 +2 points: High keyword density (${Math.round(
            keywordDensity * 100
          )}%)`
        );
      }

      return score;
    }

    isKeywordInContext(content, keyword) {
      // Check if keyword appears with relevant context words
      const contextPatterns = [
        // Questions/discussions about the topic
        new RegExp(`(what|how|why|when|where).*${keyword}`, "i"),
        new RegExp(`${keyword}.*(think|opinion|thoughts|advice)`, "i"),

        // Experience sharing
        new RegExp(`(my|our|been).*${keyword}`, "i"),
        new RegExp(`${keyword}.*(experience|journey|story)`, "i"),

        // Problems/solutions
        new RegExp(`(problem|issue|challenge).*${keyword}`, "i"),
        new RegExp(`${keyword}.*(solution|help|tips)`, "i"),

        // Learning/sharing
        new RegExp(`(learned|discovered|found).*${keyword}`, "i"),
        new RegExp(`${keyword}.*(lesson|insight|takeaway)`, "i"),
      ];

      return contextPatterns.some((pattern) => pattern.test(content));
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
        /\b(growth|traction|metrics|revenue)\b.*\b(startup|saas|product)\b/i,
      ];

      const hasFounderContent = founderPatterns.some((pattern) =>
        pattern.test(content)
      );

      if (hasFounderContent) {
        console.log(`✅ Tweet matches founder-relevant patterns`);
        return true;
      }

      console.log(`❌ Tweet not founder-relevant enough`);
      return false;
    }

    async loadRepliedTweets() {
      try {
        const result = await chrome.storage.local.get(
          "xthreads_replied_tweets"
        );
        if (result.xthreads_replied_tweets) {
          const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
          const validTweets = result.xthreads_replied_tweets.filter(
            (tweet) => tweet.timestamp > cutoff
          );

          this.repliedTweets = new Set(validTweets.map((t) => t.id));
        }
      } catch (error) {
        console.error("Failed to load replied tweets:", error);
      }
    }

    async getSettings() {
      try {
        const result = await chrome.storage.local.get("xthreads_settings");
        return result.xthreads_settings || {};
      } catch (error) {
        console.error("Failed to get settings:", error);
        return {};
      }
    }

    // Utility Functions
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
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
      const existing = document.querySelector(".xthreads-popup-indicator");
      if (existing) existing.remove();

      const indicator = document.createElement("div");
      indicator.className = "xthreads-popup-indicator";
      indicator.innerHTML = `
        <div class="xthreads-indicator-content">
          <div class="xthreads-indicator-icon">
            <img src="${chrome.runtime.getURL(
              "assets/icon16.png"
            )}" width="20" height="20" />
          </div>
          <div class="xthreads-indicator-text">
            Click the xThreads extension icon to generate your reply
          </div>
          <button class="xthreads-indicator-close">×</button>
        </div>
      `;

      // Add styles
      const style = document.createElement("style");
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
      const closeBtn = indicator.querySelector(".xthreads-indicator-close");
      closeBtn.addEventListener("click", () => indicator.remove());

      // Auto-remove after 8 seconds
      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.remove();
        }
      }, 8000);
    }

    showOpenRewritePopupIndicator() {
      // Remove existing indicator
      const existing = document.querySelector(".xthreads-rewrite-indicator");
      if (existing) existing.remove();

      const indicator = document.createElement("div");
      indicator.className = "xthreads-rewrite-indicator";
      indicator.innerHTML = `
        <div class="xthreads-indicator-content">
          <div class="xthreads-indicator-icon">
            <img src="${chrome.runtime.getURL(
              "assets/icon16.png"
            )}" width="20" height="20" />
          </div>
          <div class="xthreads-indicator-text">
            Content rewritten! Click the xThreads extension icon to see results
          </div>
          <button class="xthreads-indicator-close">×</button>
        </div>
      `;

      // Add styles
      const style = document.createElement("style");
      style.textContent = `
        .xthreads-rewrite-indicator {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 999999;
          background: #4CAF50;
          color: white;
          border-radius: 8px;
          padding: 12px 16px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 14px;
          max-width: 350px;
          animation: slideInRight 0.3s ease-out;
        }
        
        .xthreads-rewrite-indicator .xthreads-indicator-content {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .xthreads-rewrite-indicator .xthreads-indicator-text {
          flex: 1;
          line-height: 1.4;
        }
        
        .xthreads-rewrite-indicator .xthreads-indicator-close {
          background: none;
          border: none;
          color: white;
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          line-line: 1;
        }
      `;
      document.head.appendChild(style);

      document.body.appendChild(indicator);

      // Bind close button
      const closeBtn = indicator.querySelector(".xthreads-indicator-close");
      closeBtn.addEventListener("click", () => indicator.remove());

      // Auto-remove after 10 seconds
      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.remove();
        }
      }, 10000);
    }

    showAgenticReplyNotification(tweetData, reply) {
      console.log(
        "📬 Showing agentic reply notification for tweet:",
        tweetData.id
      );

      // Create notification modal
      const modal = document.createElement("div");
      modal.className = "xthreads-agentic-modal";
      modal.innerHTML = `
        <div class="xthreads-agentic-overlay"></div>
        <div class="xthreads-agentic-content">
          <div class="xthreads-agentic-header">
            <button class="xthreads-agentic-close">×</button>
          </div>
          
          <div class="xthreads-agentic-body">
            <div class="original-tweet">
              <h4>Original Tweet:</h4>
              <p>${tweetData.content || "Tweet content"}</p>
              <small>by @${tweetData.author || "unknown"}</small>
            </div>
            
            <div class="generated-reply">
              <h4>Generated Reply:</h4>
              <textarea class="reply-textarea">${reply}</textarea>
              <div class="character-count">
                <span class="count">${reply.length}</span>/280
              </div>
            </div>
            
            <div class="ai-disclaimer-modal">
              This reply was generated by AI. Please review and edit before posting.
            </div>
          </div>
          
          <div class="xthreads-agentic-actions">
            <button class="btn-secondary" id="editReplyBtn">Edit Reply</button>
            <button class="btn-primary" id="copyReplyBtn">Copy & Close</button>
            <button class="btn-secondary" id="dismissBtn">Dismiss</button>
          </div>
        </div>
      `;

      // Add styles
      const style = document.createElement("style");
      style.textContent = `
        .xthreads-agentic-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .xthreads-agentic-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
        }
        
        .xthreads-agentic-content {
          position: relative;
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 500px;
          max-height: 80vh;
          overflow: hidden;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }
        
        .xthreads-agentic-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
        }
        
        .xthreads-agentic-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #1f2937;
        }
        
        .xthreads-agentic-close {
          background: none;
          border: none;
          font-size: 24px;
          color: #6b7280;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }
        
        .xthreads-agentic-close:hover {
          color: #1f2937;
        }
        
        .xthreads-agentic-body {
          padding: 20px;
          max-height: 400px;
          overflow-y: auto;
        }
        
        .original-tweet, .generated-reply {
          margin-bottom: 20px;
        }
        
        .original-tweet h4, .generated-reply h4 {
          margin: 0 0 8px 0;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }
        
        .original-tweet p {
          background: #f3f4f6;
          padding: 12px;
          border-radius: 8px;
          margin: 0 0 8px 0;
          font-size: 14px;
          line-height: 1.4;
          color: #1f2937;
        }
        
        .original-tweet small {
          color: #6b7280;
          font-size: 12px;
        }
        
        .reply-textarea {
          width: 100%;
          padding: 12px;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 14px;
          line-height: 1.4;
          resize: vertical;
          min-height: 100px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        
        .reply-textarea:focus {
          outline: none;
          border-color: #00bcd4;
        }
        
        .character-count {
          text-align: right;
          margin-top: 8px;
          font-size: 12px;
          color: #6b7280;
        }
        
        .character-count .count {
          font-weight: 600;
        }
        
        .ai-disclaimer-modal {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 6px;
          padding: 12px;
          font-size: 12px;
          color: #1e40af;
          text-align: center;
        }
        
        .xthreads-agentic-actions {
          padding: 20px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }
        
        .xthreads-agentic-actions button {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid #d1d5db;
          background: white;
        }
        
        .xthreads-agentic-actions .btn-primary {
          background: #00bcd4;
          color: white;
          border-color: #00bcd4;
        }
        
        .xthreads-agentic-actions .btn-primary:hover {
          background: #00acc1;
        }
        
        .xthreads-agentic-actions .btn-secondary:hover {
          background: #f3f4f6;
        }
      `;
      document.head.appendChild(style);

      // Add modal to page
      document.body.appendChild(modal);

      // Get elements
      const textarea = modal.querySelector(".reply-textarea");
      const characterCount = modal.querySelector(".count");
      const closeBtn = modal.querySelector(".xthreads-agentic-close");
      const copyBtn = modal.querySelector("#copyReplyBtn");
      const editBtn = modal.querySelector("#editReplyBtn");
      const dismissBtn = modal.querySelector("#dismissBtn");
      const overlay = modal.querySelector(".xthreads-agentic-overlay");

      // Update character count on input
      textarea.addEventListener("input", () => {
        const length = textarea.value.length;
        characterCount.textContent = length;
        characterCount.style.color = length > 280 ? "#ef4444" : "#6b7280";
      });

      // Close handlers
      const closeModal = () => {
        modal.remove();
        style.remove();
      };

      closeBtn.addEventListener("click", closeModal);
      overlay.addEventListener("click", closeModal);
      dismissBtn.addEventListener("click", closeModal);

      // Copy and close
      copyBtn.addEventListener("click", () => {
        const replyText = textarea.value.trim();
        if (replyText) {
          navigator.clipboard
            .writeText(replyText)
            .then(() => {
              this.showToast("Reply copied to clipboard!", "success");
              closeModal();
            })
            .catch(() => {
              // Fallback for older browsers
              textarea.select();
              document.execCommand("copy");
              this.showToast("Reply copied to clipboard!", "success");
              closeModal();
            });
        }
      });

      // Edit functionality
      editBtn.addEventListener("click", () => {
        textarea.focus();
        textarea.setSelectionRange(
          textarea.value.length,
          textarea.value.length
        );
      });

      // Escape key to close
      document.addEventListener("keydown", function escapeHandler(e) {
        if (e.key === "Escape" && document.body.contains(modal)) {
          closeModal();
          document.removeEventListener("keydown", escapeHandler);
        }
      });

      console.log("✅ Agentic reply notification displayed");
    }

    showToast(message, type = "info") {
      const toast = document.createElement("div");
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
