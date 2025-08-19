#!/usr/bin/env node

/**
 * Script to fetch images and branding from legacyf-l.com
 * Run this when the domain becomes accessible
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOMAIN = 'legacyf-l.com';
const BASE_URL = `https://${DOMAIN}`;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

/**
 * Download a file from URL to local path
 */
function downloadFile(url, localPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode === 200) {
        const file = fs.createWriteStream(localPath);
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`✓ Downloaded: ${url} -> ${localPath}`);
          resolve();
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirects
        downloadFile(response.headers.location, localPath)
          .then(resolve)
          .catch(reject);
      } else {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
      }
    }).on('error', reject);
  });
}

/**
 * Extract image URLs from HTML content
 */
function extractImageUrls(html, baseUrl) {
  const imageRegex = /<img[^>]+src=['"]([^'"]+)['"][^>]*>/gi;
  const logoRegex = /<[^>]*class=['"][^'"]*logo[^'"]*['"][^>]*src=['"]([^'"]+)['"][^>]*>/gi;
  const urls = new Set();
  
  let match;
  
  // Extract all img src attributes
  while ((match = imageRegex.exec(html)) !== null) {
    const url = new URL(match[1], baseUrl).href;
    urls.add(url);
  }
  
  // Look for logo-specific images
  while ((match = logoRegex.exec(html)) !== null) {
    const url = new URL(match[1], baseUrl).href;
    urls.add(url);
  }
  
  // Look for favicon
  const faviconRegex = /<link[^>]+rel=['"][^'"]*icon[^'"]*['"][^>]+href=['"]([^'"]+)['"][^>]*>/gi;
  while ((match = faviconRegex.exec(html)) !== null) {
    const url = new URL(match[1], baseUrl).href;
    urls.add(url);
  }
  
  return Array.from(urls);
}

/**
 * Get filename from URL
 */
function getFilenameFromUrl(url) {
  const pathname = new URL(url).pathname;
  let filename = path.basename(pathname);
  
  // If no extension, try to guess from content-type later
  if (!path.extname(filename)) {
    filename += '.jpg'; // default extension
  }
  
  return filename;
}

/**
 * Main function to fetch images
 */
async function fetchImages() {
  console.log(`Fetching images from ${BASE_URL}...`);
  
  try {
    // First, try to fetch the main page
    const protocol = BASE_URL.startsWith('https:') ? https : http;
    
    const html = await new Promise((resolve, reject) => {
      protocol.get(BASE_URL, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to fetch ${BASE_URL}: ${response.statusCode}`));
          return;
        }
        
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
      }).on('error', reject);
    });
    
    console.log('✓ Successfully fetched website HTML');
    
    // Extract image URLs
    const imageUrls = extractImageUrls(html, BASE_URL);
    console.log(`Found ${imageUrls.length} images to download:`);
    imageUrls.forEach(url => console.log(`  - ${url}`));
    
    // Download each image
    const downloadPromises = imageUrls.map(async (url) => {
      try {
        const filename = getFilenameFromUrl(url);
        const localPath = path.join(IMAGES_DIR, filename);
        await downloadFile(url, localPath);
        return { url, localPath, filename };
      } catch (error) {
        console.warn(`⚠ Failed to download ${url}: ${error.message}`);
        return null;
      }
    });
    
    const results = await Promise.all(downloadPromises);
    const successful = results.filter(Boolean);
    
    console.log(`\n✓ Successfully downloaded ${successful.length} images to ${IMAGES_DIR}`);
    
    // Generate a mapping file for easy reference
    const mapping = {
      domain: DOMAIN,
      baseUrl: BASE_URL,
      downloadedAt: new Date().toISOString(),
      images: successful
    };
    
    fs.writeFileSync(
      path.join(IMAGES_DIR, 'image-mapping.json'),
      JSON.stringify(mapping, null, 2)
    );
    
    console.log('✓ Created image mapping file at images/image-mapping.json');
    
    // Suggest component updates
    console.log('\n📝 Next steps:');
    console.log('1. Review downloaded images in /public/images/');
    console.log('2. Update components to use new images:');
    console.log('   - Header.astro: Update logo src');
    console.log('   - Team.astro: Update team photo src');
    console.log('   - Add any hero/banner images to components');
    console.log('3. Update alt text and image descriptions');
    console.log('4. Test responsive behavior');
    
  } catch (error) {
    console.error(`✗ Error fetching images: ${error.message}`);
    
    if (error.code === 'ENOTFOUND') {
      console.log('\n💡 The domain appears to be inaccessible. Try:');
      console.log('1. Verify the correct domain name');
      console.log('2. Check if the website is live');
      console.log('3. Try alternative domain variations');
      console.log('4. Contact the website owner for image assets');
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchImages();
}

export { fetchImages, downloadFile, extractImageUrls };