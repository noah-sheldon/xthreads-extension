#!/bin/bash

# Production Build Script for xThreads Agent Extension
# Creates a clean ZIP file for browser store submissions

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REQUIRED_FILES=(
    "manifest.json"
    "popup.html"
    "popup.css"
    "popup.js"
    "content.js"
    "content.css"
    "background.js"
    "onboarding.html"
    "onboarding.css"
    "onboarding.js"
)

REQUIRED_DIRS=(
    "assets"
)

OUTPUT_DIR="production-build"
TEMP_DIR="temp-build"

# Functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Get version from manifest.json
get_version() {
    if [[ ! -f "manifest.json" ]]; then
        log_error "manifest.json not found!"
    fi
    
    VERSION=$(grep '"version"' manifest.json | sed 's/.*"version": *"\([^"]*\)".*/\1/')
    if [[ -z "$VERSION" ]]; then
        log_error "Could not extract version from manifest.json"
    fi
    
    echo "$VERSION"
}

# Validate required files exist
validate_files() {
    log_info "Validating required files..."
    
    for file in "${REQUIRED_FILES[@]}"; do
        if [[ ! -f "$file" ]]; then
            log_error "Required file missing: $file"
        fi
    done
    
    for dir in "${REQUIRED_DIRS[@]}"; do
        if [[ ! -d "$dir" ]]; then
            log_error "Required directory missing: $dir"
        fi
    done
    
    log_success "All required files validated"
}

# Clean up previous builds
cleanup() {
    log_info "Cleaning up previous builds..."
    rm -rf "$OUTPUT_DIR" "$TEMP_DIR"
    log_success "Cleaned up directories"
}

# Create directories
create_dirs() {
    mkdir -p "$OUTPUT_DIR" "$TEMP_DIR"
    log_success "Created build directories"
}

# Copy files to temp directory
copy_files() {
    log_info "Copying files..."
    
    # Copy required files
    for file in "${REQUIRED_FILES[@]}"; do
        cp "$file" "$TEMP_DIR/"
        log_info "Copied $file"
    done
    
    # Copy required directories
    for dir in "${REQUIRED_DIRS[@]}"; do
        cp -r "$dir" "$TEMP_DIR/"
        log_info "Copied directory $dir"
    done
    
    log_success "All files copied"
}

# Create ZIP file
create_zip() {
    local version="$1"
    local zip_name="xthreads-agent-v${version}.zip"
    local zip_path="$OUTPUT_DIR/$zip_name"
    
    log_info "Creating ZIP file..."
    
    # Change to temp directory and create zip
    (cd "$TEMP_DIR" && zip -r "../$zip_path" .)
    
    # Get file size
    local size=$(ls -lh "$zip_path" | awk '{print $5}')
    log_success "Created $zip_name (Size: $size)"
    
    echo "$zip_path"
}

# Generate build information
generate_build_info() {
    local version="$1"
    local zip_path="$2"
    local build_info_file="$OUTPUT_DIR/build-info-v${version}.json"
    
    cat > "$build_info_file" << EOF
{
  "buildDate": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "version": "$version",
  "zipFile": "$(basename "$zip_path")",
  "fileSize": $(stat -f%z "$zip_path" 2>/dev/null || stat -c%s "$zip_path" 2>/dev/null),
  "filesIncluded": [
$(printf '    "%s"' "${REQUIRED_FILES[@]}" | paste -sd "," -)
  ],
  "directoriesIncluded": [
$(printf '    "%s"' "${REQUIRED_DIRS[@]}" | paste -sd "," -)
  ]
}
EOF
    
    log_success "Generated build info: $build_info_file"
}

# Main build process
main() {
    echo
    log_info "🚀 Starting xThreads Agent production build..."
    echo
    
    # Get version
    VERSION=$(get_version)
    log_info "Building version: $VERSION"
    
    # Build steps
    cleanup
    create_dirs
    validate_files
    copy_files
    
    # Create ZIP
    ZIP_PATH=$(create_zip "$VERSION")
    
    # Generate build info
    generate_build_info "$VERSION" "$ZIP_PATH"
    
    # Cleanup temp directory
    rm -rf "$TEMP_DIR"
    
    echo
    log_success "🎉 Production build completed successfully!"
    log_success "📦 Output: $ZIP_PATH"
    echo
    log_info "Next steps:"
    log_info "1. Take screenshots for store listings"
    log_info "2. Submit to Chrome Web Store"
    log_info "3. Submit to Firefox Add-ons"
    log_info "4. Submit to Microsoft Edge Add-ons"
    echo
}

# Run main function
main "$@"