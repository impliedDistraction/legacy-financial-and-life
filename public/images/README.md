# Images and Branding Setup

This directory contains the image assets and branding for Legacy Financial & Life.

## Current Status

The `legacyf-l.com` domain is currently not accessible. Once it becomes available, you can automatically fetch all images and branding using the provided script.

## Quick Start

1. **When legacyf-l.com becomes accessible**, run:
   ```bash
   npm run fetch-images
   ```

2. **Review downloaded images** in `/public/images/`

3. **Update components** to use the new images (see guide below)

## Manual Setup (Alternative)

If you have access to the images through another method:

1. Place images in `/public/images/` directory
2. Follow the naming conventions below
3. Update the components as described

## Expected Images

Based on the current site structure, these images are needed:

### Essential Images
- **Company Logo** (`logo.svg` or `logo.png`)
  - Used in: Header navigation
  - Current placeholder: `/favicon.svg`
  - Recommended size: 32x32px (SVG preferred)

- **Team Photo** (`team-photo.jpg` or `team-headshot.jpg`)
  - Used in: Team section
  - Current placeholder: `/og-image.jpg`
  - Recommended size: 800x600px or larger
  - Subject: Tim & Beth Byrd

### Optional Images
- **Hero Background** (`hero-bg.jpg`)
  - For hero section background
  - Recommended size: 1920x1080px or larger

- **Open Graph Image** (`og-image.jpg`)
  - For social media sharing
  - Current: Generic placeholder
  - Recommended size: 1200x630px

## Component Updates

After downloading/adding images, update these components:

### 1. Header Logo (`src/components/Header.astro`)
```astro
<!-- Replace line 7 -->
<img src="/images/logo.svg" alt="Legacy Financial & Life" class="h-8 w-8 rounded">
```

### 2. Team Photo (`src/components/Team.astro`)
```astro
<!-- Replace line 7 -->
<img src="/images/team-photo.jpg" alt={site.team.headshotAlt} class="rounded-2xl border border-slate-200 sm:col-span-2 hover-scale scroll-hidden" style="transition-delay: 0.1s;">
```

### 3. SEO Meta Image (`src/components/SEO.astro`)
```astro
<!-- Replace line 7 -->
<meta property="og:image" content="/images/og-image.jpg">
```

### 4. Favicon (`src/layouts/Base.astro`)
```astro
<!-- Replace line 11 -->
<link rel="icon" href="/images/favicon.ico">
```

## Image Optimization Tips

1. **Compress images** before adding them
2. **Use appropriate formats**:
   - SVG for logos and simple graphics
   - WebP for photos (with JPG fallback)
   - PNG for images with transparency
3. **Provide alt text** for accessibility
4. **Test responsive behavior** on different screen sizes

## File Structure

```
public/
├── images/
│   ├── logo.svg              # Company logo
│   ├── team-photo.jpg        # Tim & Beth Byrd photo
│   ├── hero-bg.jpg          # Hero section background (optional)
│   ├── og-image.jpg         # Social media sharing image
│   ├── favicon.ico          # Browser favicon
│   └── image-mapping.json   # Auto-generated mapping (from script)
```

## Troubleshooting

### Domain Issues
- Verify the domain name is correct: `legacyf-l.com`
- Check if website is live and accessible
- Try variations: `www.legacyf-l.com`, `legacyfl.com`

### Manual Download
If the script doesn't work, you can manually:
1. Visit the source website
2. Right-click and save images
3. Place them in `/public/images/`
4. Update component references

### Permission Issues
Ensure you have explicit permission to use all images and branding materials from the source website.