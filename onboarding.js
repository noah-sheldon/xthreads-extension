class XThreadsOnboarding {
  constructor() {
    this.currentStep = 1;
    this.settings = {
      apiKey: '',
      keywords: [],
      tone: 'neutral',
      mode: 'manual',
      isActive: false,
      isOnboarded: false
    };

    this.init();
  }

  init() {
    this.bindEvents();
    this.updateProgress();
  }

  bindEvents() {
    // API Key validation
    const apiKeyInput = document.getElementById('onboardingApiKey');
    const validateBtn = document.getElementById('validateApiKey');

    apiKeyInput.addEventListener('input', (e) => {
      const apiKey = e.target.value.trim();
      validateBtn.disabled = apiKey.length < 10;
      
      // Clear previous validation messages
      const validationMsg = document.getElementById('apiKeyValidation');
      validationMsg.textContent = '';
      validationMsg.className = 'validation-message';
    });

    validateBtn.addEventListener('click', () => {
      this.validateApiKey();
    });

    // Keywords input
    const keywordsInput = document.getElementById('onboardingKeywords');
    keywordsInput.addEventListener('input', (e) => {
      this.settings.keywords = e.target.value
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
    });

    // Tone selection
    document.querySelectorAll('.tone-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tone-option').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.settings.tone = e.currentTarget.dataset.tone;
      });
    });

    // Navigation buttons
    document.getElementById('backToStep1').addEventListener('click', () => {
      this.goToStep(1);
    });

    document.getElementById('continueToStep3').addEventListener('click', () => {
      this.goToStep(3);
    });

    document.getElementById('backToStep2').addEventListener('click', () => {
      this.goToStep(2);
    });

    document.getElementById('finishOnboarding').addEventListener('click', () => {
      this.finishOnboarding();
    });

    document.getElementById('openTwitter').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://x.com' });
      window.close();
    });
  }

  async validateApiKey() {
    const apiKey = document.getElementById('onboardingApiKey').value.trim();
    const validateBtn = document.getElementById('validateApiKey');
    const validationMsg = document.getElementById('apiKeyValidation');

    if (!apiKey) {
      this.showValidationMessage('Please enter an API key', 'error');
      return;
    }

    // Show loading state
    validateBtn.disabled = true;
    validateBtn.innerHTML = `
      <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1"/>
        <path d="M16 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1"/>
        <path d="M11 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1"/>
      </svg>
      Validating...
    `;

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

      if (response.ok) {
        this.settings.apiKey = apiKey;
        this.showValidationMessage('API key validated successfully!', 'success');
        
        // Wait a moment then proceed to next step
        setTimeout(() => {
          this.goToStep(2);
        }, 1500);
      } else {
        throw new Error(`API validation failed: ${response.status}`);
      }
    } catch (error) {
      console.error('API key validation failed:', error);
      this.showValidationMessage('Invalid API key. Please check and try again.', 'error');
      
      // Reset button
      validateBtn.disabled = false;
      validateBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 12l2 2 4-4"/>
          <circle cx="12" cy="12" r="10"/>
        </svg>
        Validate & Continue
      `;
    }
  }

  showValidationMessage(message, type) {
    const validationMsg = document.getElementById('apiKeyValidation');
    validationMsg.textContent = message;
    validationMsg.className = `validation-message ${type}`;
  }

  goToStep(stepNumber) {
    // Hide current step
    document.querySelectorAll('.step').forEach(step => {
      step.classList.remove('active');
    });

    // Show target step
    document.getElementById(`step${stepNumber}`).classList.add('active');
    
    this.currentStep = stepNumber;
    this.updateProgress();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  updateProgress() {
    const progressFill = document.getElementById('progressFill');
    const progress = (this.currentStep / 4) * 100;
    progressFill.style.width = `${progress}%`;
  }

  async finishOnboarding() {
    try {
      // Ensure we have keywords
      const keywordsInput = document.getElementById('onboardingKeywords');
      if (keywordsInput.value.trim()) {
        this.settings.keywords = keywordsInput.value
          .split(',')
          .map(k => k.trim())
          .filter(k => k.length > 0);
      }

      // Set default keywords if none provided
      if (this.settings.keywords.length === 0) {
        this.settings.keywords = ['AI', 'tech', 'startup', 'coding', 'development'];
      }

      // Mark as onboarded
      this.settings.isOnboarded = true;

      // Save settings
      await chrome.storage.local.set({
        xthreads_settings: this.settings
      });

      this.showToast('Setup completed successfully!', 'success');
      
      // Go to final step
      this.goToStep(4);

    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      this.showToast('Failed to save settings. Please try again.', 'error');
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

// Add CSS for spinning animation
const style = document.createElement('style');
style.textContent = `
  .animate-spin {
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;
document.head.appendChild(style);

// Initialize onboarding when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new XThreadsOnboarding();
});