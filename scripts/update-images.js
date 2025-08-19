#!/usr/bin/env node

/**
 * Helper script to update image references after new images are downloaded
 * This script will automatically update the site.ts configuration when new images are available
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');
const SITE_CONFIG_PATH = path.join(__dirname, '..', 'src', 'content', 'site.ts');

/**
 * Check if a file exists in the images directory
 */
function imageExists(filename) {
  return fs.existsSync(path.join(IMAGES_DIR, filename));
}

/**
 * Update the site configuration with new image paths
 */
function updateSiteConfig() {
  console.log('🔍 Checking for new images...');
  
  // Read current site config
  const siteConfigContent = fs.readFileSync(SITE_CONFIG_PATH, 'utf8');
  let updatedContent = siteConfigContent;
  let hasUpdates = false;
  
  // Define image mappings: [filename, configPath, description]
  const imageMappings = [
    ['logo.svg', 'branding.logo', 'Company logo'],
    ['logo.png', 'branding.logo', 'Company logo'],
    ['team-photo.jpg', 'team.headshotSrc', 'Team photo'],
    ['team-headshot.jpg', 'team.headshotSrc', 'Team photo'],
    ['og-image.jpg', 'branding.ogImage', 'Open Graph image'],
    ['favicon.ico', 'branding.favicon', 'Favicon'],
    ['favicon.svg', 'branding.favicon', 'Favicon']
  ];
  
  // Check each mapping
  imageMappings.forEach(([filename, configPath, description]) => {
    if (imageExists(filename)) {
      const newPath = `/images/${filename}`;
      console.log(`✓ Found ${description}: ${filename}`);
      
      // Update the configuration
      if (configPath === 'branding.logo') {
        const oldPattern = /logo:\s*['"`][^'"`]*['"`]/g;
        const newValue = `logo: '${newPath}'`;
        if (oldPattern.test(updatedContent)) {
          updatedContent = updatedContent.replace(oldPattern, newValue);
          hasUpdates = true;
          console.log(`  → Updated ${configPath} to ${newPath}`);
        }
      } else if (configPath === 'team.headshotSrc') {
        const oldPattern = /headshotSrc:\s*['"`][^'"`]*['"`]/g;
        const newValue = `headshotSrc: '${newPath}'`;
        if (oldPattern.test(updatedContent)) {
          updatedContent = updatedContent.replace(oldPattern, newValue);
          hasUpdates = true;
          console.log(`  → Updated ${configPath} to ${newPath}`);
        }
      } else if (configPath === 'branding.ogImage') {
        const oldPattern = /ogImage:\s*['"`][^'"`]*['"`]/g;
        const newValue = `ogImage: '${newPath}'`;
        if (oldPattern.test(updatedContent)) {
          updatedContent = updatedContent.replace(oldPattern, newValue);
          hasUpdates = true;
          console.log(`  → Updated ${configPath} to ${newPath}`);
        }
      } else if (configPath === 'branding.favicon') {
        const oldPattern = /favicon:\s*['"`][^'"`]*['"`]/g;
        const newValue = `favicon: '${newPath}'`;
        if (oldPattern.test(updatedContent)) {
          updatedContent = updatedContent.replace(oldPattern, newValue);
          hasUpdates = true;
          console.log(`  → Updated ${configPath} to ${newPath}`);
        }
      }
    }
  });
  
  // Write updated content if there were changes
  if (hasUpdates) {
    fs.writeFileSync(SITE_CONFIG_PATH, updatedContent);
    console.log('\n✅ Site configuration updated successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Review the changes in src/content/site.ts');
    console.log('2. Test the site: npm run dev');
    console.log('3. Build for production: npm run build');
  } else {
    console.log('\n💡 No new images found or configuration already up to date.');
    console.log('\nExpected image files in /public/images/:');
    imageMappings.forEach(([filename, , description]) => {
      const exists = imageExists(filename);
      const status = exists ? '✓' : '✗';
      console.log(`  ${status} ${filename} (${description})`);
    });
  }
}

/**
 * Show current configuration status
 */
function showStatus() {
  console.log('📊 Current Image Configuration Status:\n');
  
  // Check what images exist
  const images = fs.existsSync(IMAGES_DIR) ? fs.readdirSync(IMAGES_DIR) : [];
  
  if (images.length === 0) {
    console.log('No images found in /public/images/');
    console.log('Run "npm run fetch-images" to download from legacyf-l.com');
    return;
  }
  
  console.log('Images found:');
  images.forEach(filename => {
    if (filename !== 'README.md' && filename !== 'image-mapping.json') {
      console.log(`  ✓ ${filename}`);
    }
  });
  
  // Show current config
  const siteConfigContent = fs.readFileSync(SITE_CONFIG_PATH, 'utf8');
  const logoMatch = siteConfigContent.match(/logo:\s*['"`]([^'"`]*)['"`]/);
  const headshotMatch = siteConfigContent.match(/headshotSrc:\s*['"`]([^'"`]*)['"`]/);
  const ogImageMatch = siteConfigContent.match(/ogImage:\s*['"`]([^'"`]*)['"`]/);
  const faviconMatch = siteConfigContent.match(/favicon:\s*['"`]([^'"`]*)['"`]/);
  
  console.log('\nCurrent configuration:');
  console.log(`  Logo: ${logoMatch ? logoMatch[1] : 'not found'}`);
  console.log(`  Team photo: ${headshotMatch ? headshotMatch[1] : 'not found'}`);
  console.log(`  OG image: ${ogImageMatch ? ogImageMatch[1] : 'not found'}`);
  console.log(`  Favicon: ${faviconMatch ? faviconMatch[1] : 'not found'}`);
}

// Main function
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--status') || args.includes('-s')) {
    showStatus();
  } else {
    updateSiteConfig();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { updateSiteConfig, showStatus };