#!/usr/bin/env node

/**
 * Production Build Script for xThreads Agent Extension
 * 
 * This script automatically creates a clean, production-ready ZIP file
 * for browser extension store submissions.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const config = {
  // Files required for extension submission
  requiredFiles: [
    'manifest.json',
    'popup.html',
    'popup.css', 
    'popup.js',
    'content.js',
    'content.css',
    'background.js',
    'onboarding.html',
    'onboarding.css',
    'onboarding.js'
  ],
  
  // Directories to include
  requiredDirs: [
    'assets'
  ],
  
  // Files to exclude from production build
  excludePatterns: [
    'node_modules',
    'src',
    'dist', 
    '.git',
    '*.md',
    '*.json' // Excludes package.json, tsconfig.json, etc (except manifest.json which is explicitly included)
  ],
  
  // Output configuration
  outputDir: 'production-build',
  tempDir: 'temp-build'
};

class ProductionBuilder {
  constructor() {
    this.rootDir = process.cwd();
    this.version = this.getVersionFromManifest();
    this.outputZip = `xthreads-agent-v${this.version}.zip`;
  }

  getVersionFromManifest() {
    try {
      const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
      return manifest.version;
    } catch (error) {
      console.error('❌ Error reading manifest.json:', error.message);
      process.exit(1);
    }
  }

  log(message, type = 'info') {
    const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
    console.log(`${icons[type]} ${message}`);
  }

  cleanupDirectories() {
    const dirsToClean = [config.outputDir, config.tempDir];
    
    dirsToClean.forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        this.log(`Cleaned up ${dir}`, 'info');
      }
    });
  }

  createDirectories() {
    [config.outputDir, config.tempDir].forEach(dir => {
      fs.mkdirSync(dir, { recursive: true });
    });
    this.log('Created build directories', 'success');
  }

  validateRequiredFiles() {
    const missing = [];
    
    config.requiredFiles.forEach(file => {
      if (!fs.existsSync(file)) {
        missing.push(file);
      }
    });

    config.requiredDirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        missing.push(dir);
      }
    });

    if (missing.length > 0) {
      this.log(`Missing required files/directories: ${missing.join(', ')}`, 'error');
      process.exit(1);
    }

    this.log('All required files validated', 'success');
  }

  copyFiles() {
    // Copy required files
    config.requiredFiles.forEach(file => {
      const dest = path.join(config.tempDir, file);
      fs.copyFileSync(file, dest);
      this.log(`Copied ${file}`, 'info');
    });

    // Copy required directories
    config.requiredDirs.forEach(dir => {
      const dest = path.join(config.tempDir, dir);
      this.copyDirectory(dir, dest);
      this.log(`Copied directory ${dir}`, 'info');
    });
  }

  copyDirectory(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    entries.forEach(entry => {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    });
  }

  validateManifest() {
    const manifestPath = path.join(config.tempDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    // Validation checks
    const checks = [
      { 
        condition: manifest.manifest_version === 3, 
        message: 'Manifest version should be 3' 
      },
      { 
        condition: manifest.name && manifest.name.length > 0, 
        message: 'Extension name is required' 
      },
      { 
        condition: manifest.version && /^\d+\.\d+\.\d+$/.test(manifest.version), 
        message: 'Version should follow semantic versioning (x.y.z)' 
      },
      { 
        condition: manifest.description && manifest.description.length > 0, 
        message: 'Description is required' 
      },
      { 
        condition: manifest.icons && manifest.icons['16'] && manifest.icons['48'] && manifest.icons['128'], 
        message: 'Icons for 16, 48, and 128 sizes are required' 
      }
    ];

    const failed = checks.filter(check => !check.condition);
    
    if (failed.length > 0) {
      this.log('Manifest validation failed:', 'error');
      failed.forEach(check => this.log(`  - ${check.message}`, 'error'));
      process.exit(1);
    }

    this.log('Manifest validation passed', 'success');
    return manifest;
  }

  createZip() {
    try {
      // Change to temp directory and create zip
      const originalDir = process.cwd();
      process.chdir(config.tempDir);
      
      // Create zip file in parent directory
      const zipPath = path.join('..', config.outputDir, this.outputZip);
      execSync(`zip -r "${zipPath}" *`, { stdio: 'inherit' });
      
      process.chdir(originalDir);
      this.log(`Created ${this.outputZip}`, 'success');
      
      // Get file size
      const zipFullPath = path.join(config.outputDir, this.outputZip);
      const stats = fs.statSync(zipFullPath);
      const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      this.log(`ZIP file size: ${fileSizeInMB} MB`, 'info');
      
      return zipFullPath;
    } catch (error) {
      this.log(`Failed to create ZIP: ${error.message}`, 'error');
      process.exit(1);
    }
  }

  generateBuildInfo(manifest, zipPath) {
    const buildInfo = {
      buildDate: new Date().toISOString(),
      version: this.version,
      extensionName: manifest.name,
      zipFile: this.outputZip,
      fileSize: fs.statSync(zipPath).size,
      filesIncluded: config.requiredFiles.concat(config.requiredDirs),
      manifestVersion: manifest.manifest_version,
      permissions: manifest.permissions || [],
      hostPermissions: manifest.host_permissions || []
    };

    const buildInfoPath = path.join(config.outputDir, `build-info-v${this.version}.json`);
    fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
    this.log(`Generated build info: ${buildInfoPath}`, 'success');
  }

  build() {
    this.log(`🚀 Starting production build for xThreads Agent v${this.version}`, 'info');
    this.log('', 'info');

    try {
      // Build steps
      this.cleanupDirectories();
      this.createDirectories();
      this.validateRequiredFiles();
      this.copyFiles();
      
      const manifest = this.validateManifest();
      const zipPath = this.createZip();
      this.generateBuildInfo(manifest, zipPath);
      
      // Cleanup temp directory
      fs.rmSync(config.tempDir, { recursive: true, force: true });
      
      this.log('', 'info');
      this.log('🎉 Production build completed successfully!', 'success');
      this.log(`📦 Output: ${path.join(config.outputDir, this.outputZip)}`, 'success');
      this.log('', 'info');
      this.log('Next steps:', 'info');
      this.log('1. Take screenshots for store listings', 'info');
      this.log('2. Submit to Chrome Web Store', 'info');
      this.log('3. Submit to Firefox Add-ons', 'info');
      this.log('4. Submit to Microsoft Edge Add-ons', 'info');
      
    } catch (error) {
      this.log(`Build failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// Run the build
if (require.main === module) {
  new ProductionBuilder().build();
}

module.exports = ProductionBuilder;