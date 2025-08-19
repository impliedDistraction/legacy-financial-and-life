# Images and Branding Setup Guide

This document explains how to pull images and branding from legacyf-l.com and integrate them into the Legacy Financial & Life website.

## Quick Start

When the `legacyf-l.com` domain becomes accessible:

```bash
# 1. Download all images from the website
npm run fetch-images

# 2. Update component configurations automatically
npm run update-images

# 3. Check the status of images
npm run images:status

# 4. Test the changes
npm run dev
```

## Current Status

❌ **Domain Issue**: `legacyf-l.com` is currently not accessible (DNS resolution fails)

The automated scripts are ready to run once the domain becomes available.

## Manual Process (Alternative)

If you need to add images manually:

### 1. Obtain Images
- Get the images from legacyf-l.com through another method
- Ensure you have permission to use all images and branding

### 2. Add Images to Project
Place images in `/public/images/` with these recommended names:

- `logo.svg` or `logo.png` - Company logo
- `team-photo.jpg` - Tim & Beth Byrd photo  
- `og-image.jpg` - Social media sharing image
- `favicon.ico` - Browser icon

### 3. Update Configuration
Run the automatic update:
```bash
npm run update-images
```

Or manually edit `/src/content/site.ts`:
```typescript
branding: {
  logo: '/images/logo.svg',
  ogImage: '/images/og-image.jpg', 
  favicon: '/images/favicon.ico'
},
team: {
  headshotSrc: '/images/team-photo.jpg',
  // ... other properties
}
```

## Scripts Reference

### `npm run fetch-images`
- Downloads all images from legacyf-l.com
- Extracts logos, photos, favicons automatically  
- Creates `/public/images/image-mapping.json` with details
- Provides guidance for next steps

### `npm run update-images`
- Scans `/public/images/` for new files
- Automatically updates `/src/content/site.ts` configuration
- Updates component references to use new images

### `npm run images:status`
- Shows current image configuration status
- Lists which images are found vs. expected
- Displays current paths in configuration

## Image Requirements

| Image Type | Filename | Usage | Recommended Size |
|------------|----------|-------|------------------|
| Company Logo | `logo.svg` or `logo.png` | Header navigation | 32x32px (SVG preferred) |
| Team Photo | `team-photo.jpg` | Team section | 800x600px+ |
| OG Image | `og-image.jpg` | Social sharing | 1200x630px |
| Favicon | `favicon.ico` | Browser icon | 16x16, 32x32px |

## Components Updated

The following components automatically use the centralized image configuration:

- **Header.astro** - Uses `site.branding.logo`
- **Team.astro** - Uses `site.team.headshotSrc`  
- **SEO.astro** - Uses `site.branding.ogImage`
- **Base.astro** - Uses `site.branding.favicon`

## Troubleshooting

### Domain Not Accessible
```
✗ Error fetching images: getaddrinfo ENOTFOUND legacyf-l.com
```

**Solutions:**
1. Verify the correct domain name
2. Check if the website is live
3. Try variations: `www.legacyf-l.com`, `legacyfl.com`
4. Contact the website owner for image assets
5. Use manual process instead

### Images Not Updating
```
💡 No new images found or configuration already up to date.
```

**Check:**
1. Images are in `/public/images/` directory
2. Images have correct filenames (see table above)
3. Run `npm run images:status` to see current state

### Build Errors
If you get build errors after updating images:

```bash
# Check TypeScript errors
npm run build

# Restart dev server
npm run dev
```

## File Structure

```
public/
├── images/
│   ├── README.md              # Documentation
│   ├── logo.svg               # Company logo
│   ├── team-photo.jpg         # Team photo
│   ├── og-image.jpg          # OG image
│   ├── favicon.ico           # Favicon
│   └── image-mapping.json    # Auto-generated (from fetch script)

scripts/
├── fetch-images.js           # Download from website
└── update-images.js          # Update configurations

src/content/
└── site.ts                   # Centralized configuration
```

## Notes

- Images are gitignored until finalized to avoid committing temporary files
- All image paths are centralized in `site.ts` for easy management
- Scripts handle multiple image formats and follow redirects
- Permission is explicitly granted to pull images from legacyf-l.com
- Components are designed to gracefully handle missing images