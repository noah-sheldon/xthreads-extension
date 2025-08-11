class XThreadsOnboarding {
  constructor() {
    this.currentStep = 1;
    this.validatedApiKey = "";
    this.brandSpaces = [];
    this.settings = {
      apiKey: "",
      selectedBrandId: "",
      keywords: [],
      tone: "professional",
      isOnboarded: false,
    };

    this.init();
  }

  init() {
    this.bindEvents();
    this.updateStepIndicator();
  }

  bindEvents() {
    // Step 1: API Key input and validation
    const apiKeyInput = document.getElementById("apiKey");
    const nextBtn = document.getElementById("nextBtn");

    apiKeyInput.addEventListener("input", (e) => {
      const apiKey = e.target.value.trim();
      nextBtn.disabled = apiKey.length < 10;

      // Clear error message when typing
      const errorMsg = document.getElementById("errorMessage");
      errorMsg.textContent = "";
    });

    nextBtn.addEventListener("click", () => {
      this.validateApiKey();
    });

    // Step 2: Settings configuration
    const backBtn = document.getElementById("backBtn");
    const finishBtn = document.getElementById("finishBtn");
    const keywordsInput = document.getElementById("keywords");

    backBtn.addEventListener("click", () => {
      this.goToStep(1);
    });

    keywordsInput.addEventListener("input", (e) => {
      this.settings.keywords = e.target.value
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
    });

    // Tone selection
    document.querySelectorAll('input[name="tone"]').forEach((radio) => {
      radio.addEventListener("change", (e) => {
        this.settings.tone = e.target.value;
      });
    });

    // Brand spaces selection
    const brandSpacesSelect = document.getElementById("brandSpaces");
    brandSpacesSelect.addEventListener("change", (e) => {
      this.settings.selectedBrandId = e.target.value;
    });

    finishBtn.addEventListener("click", () => {
      this.finishOnboarding();
    });

    // Success state
    const getStartedBtn = document.getElementById("getStartedBtn");
    getStartedBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: "https://x.com" });
      window.close();
    });
  }

  async validateApiKey() {
    const apiKey = document.getElementById("apiKey").value.trim();
    const nextBtn = document.getElementById("nextBtn");
    const errorMsg = document.getElementById("errorMessage");

    if (!apiKey) {
      this.showError("Please enter an API key");
      return;
    }

    // Show loading state
    nextBtn.disabled = true;
    nextBtn.textContent = "Validating...";

    try {
      const response = await fetch(
        "https://www.xthreads.app/api/validate-key",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            apiKey: apiKey,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.valid) {
          this.validatedApiKey = apiKey;
          this.settings.apiKey = apiKey;
          this.showToast("Key Validated", "success");

          // Wait a moment then proceed to step 2
          setTimeout(() => {
            this.goToStep(2);
          }, 1000);
        } else {
          throw new Error("Invalid API key");
        }
      } else {
        throw new Error(`API validation failed: ${response.status}`);
      }
    } catch (error) {
      console.error("API key validation failed:", error);
      this.showError("Invalid Key");
      this.showToast("Invalid Key", "error");

      // Reset button
      nextBtn.disabled = false;
      nextBtn.textContent = "Next";
    }
  }

  async loadBrandSpaces() {
    const brandSpacesSelect = document.getElementById("brandSpaces");

    if (!this.validatedApiKey) {
      brandSpacesSelect.innerHTML = '<option value="">API key not set</option>';
      this.showToast("API key missing. Please validate your key.", "error");
      brandSpacesSelect.disabled = true;
      return;
    }

    brandSpacesSelect.innerHTML =
      '<option value="">Loading brand spaces...</option>';
    brandSpacesSelect.disabled = true;

    try {
      const response = await fetch("https://www.xthreads.app/api/api-brandspaces", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.validatedApiKey,
        },
      });

      if (response.ok) {
        const data = await response.json();
        this.brandSpaces = data || [];

        brandSpacesSelect.innerHTML = "";

        if (this.brandSpaces.length === 0) {
          brandSpacesSelect.innerHTML =
            '<option value="">No brand spaces found</option>';
          this.settings.selectedBrandId = "";
        } else {
          brandSpacesSelect.innerHTML =
            '<option value="">Select a brand space</option>';

          this.brandSpaces.forEach((brand) => {
            const option = document.createElement("option");
            option.value = brand._id;
            option.textContent = brand.name;
            brandSpacesSelect.appendChild(option);
          });

          if (
            this.settings.selectedBrandId &&
            this.brandSpaces.some((b) => b._id === this.settings.selectedBrandId)
          ) {
            brandSpacesSelect.value = this.settings.selectedBrandId;
          } else if (this.brandSpaces.length > 0) {
            brandSpacesSelect.value = this.brandSpaces[0]._id;
            this.settings.selectedBrandId = this.brandSpaces[0]._id;
          } else {
            this.settings.selectedBrandId = "";
          }
        }
        await chrome.storage.local.set({ xthreads_settings: this.settings });
      } else {
        const errorData = await response.json();
        throw new Error(
          `Failed to load brand spaces: ${
            errorData.error || response.statusText
          }`
        );
      }
    } catch (error) {
      console.error("Failed to load brand spaces:", error);
      brandSpacesSelect.innerHTML =
        '<option value="">Failed to load brand spaces</option>';
      this.showToast(`Failed to load brand spaces: ${error.message}`, "error");
      this.settings.selectedBrandId = "";
    } finally {
      brandSpacesSelect.disabled = false;
    }
  }

  goToStep(stepNumber) {
    // Hide all step content
    document.querySelectorAll(".step-content").forEach((content) => {
      content.style.display = "none";
    });

    // Show target step
    const targetStep = document.getElementById(`step${stepNumber}`);
    if (stepNumber === "success") {
      document.getElementById("success").style.display = "block";
    } else {
      targetStep.style.display = "block";
    }

    this.currentStep = stepNumber;
    this.updateStepIndicator();

    // Load brand spaces when entering step 2
    if (stepNumber === 2) {
      this.loadBrandSpaces();
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  updateStepIndicator() {
    const step1Indicator = document.getElementById("step1-indicator");
    const step2Indicator = document.getElementById("step2-indicator");

    // Reset indicators
    step1Indicator.classList.remove("active");
    step2Indicator.classList.remove("active");

    // Set active indicator
    if (this.currentStep === 1) {
      step1Indicator.classList.add("active");
    } else if (this.currentStep === 2) {
      step1Indicator.classList.add("active"); // Step 1 completed
      step2Indicator.classList.add("active");
    }
  }

  async finishOnboarding() {
    const finishBtn = document.getElementById("finishBtn");
    const brandSpacesSelect = document.getElementById("brandSpaces");
    const keywordsInput = document.getElementById("keywords");

    // Validate required fields
    if (!brandSpacesSelect.value) {
      this.showToast("Please select a brand space", "error");
      return;
    }

    // Get keywords
    const keywordsValue = keywordsInput.value.trim();
    if (keywordsValue) {
      this.settings.keywords = keywordsValue
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
    }

    // Set default keywords if none provided
    if (this.settings.keywords.length === 0) {
      this.settings.keywords = ["build in public", "SaaS", "marketing"];
    }

    // Update settings
    this.settings.selectedBrandId = brandSpacesSelect.value;
    this.settings.isOnboarded = true;

    // Show loading state
    finishBtn.disabled = true;
    finishBtn.textContent = "Finishing...";

    try {
      // Save settings to storage
      await chrome.storage.local.set({
        xthreads_settings: this.settings,
      });

      this.showToast("Settings Saved!", "success");

      // Wait a moment then show success
      setTimeout(() => {
        this.goToStep("success");
      }, 1000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      this.showToast("Failed to save settings", "error");

      // Reset button
      finishBtn.disabled = false;
      finishBtn.textContent = "Finish Setup";
    }
  }

  showError(message) {
    const errorMsg = document.getElementById("errorMessage");
    errorMsg.textContent = message;
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
}

// Initialize onboarding when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new XThreadsOnboarding();
});
