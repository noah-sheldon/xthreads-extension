# xThreads Agent - Build & Submission Guide

## Pre-Submission Checklist

### ✅ **Files Required for Submission**
- [x] manifest.json (Manifest V3 compliant)
- [x] popup.html, popup.css, popup.js
- [x] content.js, content.css  
- [x] background.js
- [x] onboarding.html, onboarding.css, onboarding.js
- [x] assets/icon16.png, icon48.png, icon128.png
- [x] PRIVACY_POLICY.md

### ✅ **Files to EXCLUDE from submission**
- [ ] node_modules/
- [ ] src/ (Vite/React source files)
- [ ] dist/ (if not used)
- [ ] package.json, package-lock.json, pnpm-lock.yaml
- [ ] tsconfig.*.json
- [ ] vite.config.ts
- [ ] eslint.config.js
- [ ] postcss.config.js
- [ ] tailwind.config.js
- [ ] CLAUDE.md, BUILD_GUIDE.md
- [ ] .git/ (if present)

## Creating Submission Package

### Step 1: Create Clean Directory
```bash
mkdir xthreads-agent-submission
cd xthreads-agent-submission
```

### Step 2: Copy Required Files
```bash
# Copy essential extension files
cp manifest.json ./
cp popup.html popup.css popup.js ./
cp content.js content.css ./
cp background.js ./
cp onboarding.html onboarding.css onboarding.js ./

# Copy assets
cp -r assets/ ./

# Copy privacy policy (for reference, will be hosted on website)
cp PRIVACY_POLICY.md ./
```

### Step 3: Verify File Structure
```
xthreads-agent-submission/
├── manifest.json
├── popup.html
├── popup.css
├── popup.js
├── content.js
├── content.css
├── background.js
├── onboarding.html
├── onboarding.css
├── onboarding.js
├── assets/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── PRIVACY_POLICY.md
```

### Step 4: Create ZIP File
```bash
zip -r xthreads-agent-v1.0.0.zip *
```

## Browser-Specific Preparation

### Chrome Web Store
- **Fee**: $5 USD one-time
- **File**: Use the ZIP file created above
- **Requirements**: 
  - Privacy policy hosted at https://xthreads.app/privacy-policy
  - Clear description of API key usage
  - Screenshots showing functionality

### Firefox Add-ons
- **Fee**: Free
- **File**: Use the same ZIP file
- **Requirements**:
  - Privacy policy URL required
  - Source code explanation if using minified code

### Edge Add-ons  
- **Fee**: $19 USD one-time
- **File**: Use the same ZIP file
- **Requirements**:
  - Microsoft developer account
  - Clear permission justification

### Safari Extensions
- **Fee**: $99 USD/year (Apple Developer Program)
- **Requirements**: Most complex - needs macOS app wrapper
- **Note**: Consider as Phase 2 after other browsers

## Quality Checks Before Submission

### Code Quality
- [x] No eval() or dangerous functions
- [x] No external script loading
- [x] All API calls use HTTPS
- [x] Proper error handling

### Permissions Justification
- **activeTab**: Read tweet content when user clicks xThreads button
- **scripting**: Inject xThreads button into X.com pages  
- **storage**: Save user preferences and API key locally
- **tabs**: Open tweets in background for batch workflow
- **notifications**: Alert users about reply opportunities
- **host_permissions**: Access xThreads.app API and X.com

### Security Review
- [x] No hardcoded secrets
- [x] User data stored locally only
- [x] API key never logged or exposed
- [x] Content Security Policy compliant

### User Experience
- [x] Clear onboarding flow
- [x] Intuitive interface
- [x] Error messages are helpful
- [x] No broken functionality

## Testing Checklist

### Core Functionality
- [ ] Extension installs successfully
- [ ] Onboarding flow works
- [ ] API key setup functions
- [ ] Tweet generation works
- [ ] Reply generation works
- [ ] Thread creation works
- [ ] Batch opportunities display
- [ ] Auto-monitoring toggles correctly
- [ ] Settings save and load

### Edge Cases
- [ ] No internet connection
- [ ] Invalid API key
- [ ] API rate limits
- [ ] Very long inputs
- [ ] Empty responses
- [ ] X.com layout changes

### Cross-Browser Testing
- [ ] Chrome (primary)
- [ ] Firefox
- [ ] Edge
- [ ] Different screen sizes
- [ ] Different operating systems

## Submission Timeline
1. **Day 1**: Submit to Chrome Web Store
2. **Day 2**: Submit to Firefox Add-ons  
3. **Day 3**: Submit to Edge Add-ons
4. **Week 2**: Address any reviewer feedback
5. **Week 3-4**: Extensions go live

## Post-Submission Monitoring
- Check developer dashboards daily
- Respond to reviewer questions quickly
- Monitor user reviews and feedback
- Prepare for version 1.0.1 with any needed fixes