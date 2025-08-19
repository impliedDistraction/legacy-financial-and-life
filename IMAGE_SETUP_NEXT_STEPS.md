# Image Setup Instructions

This document provides instructions for replacing placeholder images with the actual Legacy Financial & Life brand assets.

## Required Images

Based on the issue feedback, the following images need to be manually added to complete the branding integration:

### 1. Team Photo
- **File**: `/public/images/team-photo.jpg`
- **Source**: Provided in GitHub issue #9, comment 3
- **Description**: Professional photo of Tim and Beth Byrd together
- **Current Status**: Placeholder image in place
- **Usage**: Hero section background, team section, estate planning page

### 2. Company Logo
- **File**: `/public/images/logo.svg` (or .jpg/.png)
- **Source**: Provided in GitHub issue #9, comment 3  
- **Description**: Official Legacy Financial & Life company logo
- **Current Status**: Placeholder SVG in place
- **Usage**: Header navigation, SEO meta tags, branding

## Manual Setup Steps

Since the GitHub image URLs are not directly accessible via curl/wget, follow these steps:

1. **Download images from GitHub issue**:
   - Go to: https://github.com/impliedDistraction/legacy-financial-and-life/issues/9#issuecomment-3201295704
   - Right-click on the team photo → "Save image as" → `public/images/team-photo.jpg`
   - Right-click on the logo → "Save image as" → `public/images/logo.svg` (or appropriate format)

2. **Verify image placement**:
   ```bash
   ls -la public/images/
   # Should show both files with actual content (not 0 bytes)
   ```

3. **Test the changes**:
   ```bash
   npm run dev
   # Visit http://localhost:4321 to see the updated branding
   ```

## What's Already Updated

The following components have been updated to use the new image paths:

- ✅ **Hero.astro**: Enhanced with team photo and floating stats
- ✅ **Team.astro**: Updated with comprehensive copy and professional styling
- ✅ **Header.astro**: Logo integration and navigation updates
- ✅ **site.ts**: Centralized branding configuration
- ✅ **New Pages**: Estate planning and hiring pages created

## Content Updates Implemented

Based on the issue feedback:

### Enhanced Hero Section
- Split layout with team photo on the right
- Floating achievement stats ($75M assets, 300+ policies)
- Trust indicators and professional credentials
- Improved call-to-action placement

### Updated Team Section  
- Comprehensive copy about Tim & Beth's experience
- Professional achievements and background
- Enhanced layout with credentials overlay
- Detailed bullet points about their expertise

### New Pages Created
1. **Estate Planning** (`/estate-planning`): Annuity-focused services
2. **Careers/Hiring** (`/hiring`): Agent recruitment with AI tools preview

### Navigation Updates
- Added "Estate Planning" and "Careers" to main navigation
- Updated routing structure for the unified site experience

## Testing

After adding the real images:

1. **Visual Check**: Verify images display correctly across all pages
2. **Performance**: Ensure images are optimized for web use
3. **Responsive**: Test on mobile devices for proper scaling
4. **SEO**: Confirm meta tags use the correct image paths

## Notes

- The site infrastructure is fully ready for the real images
- All component references use centralized configuration
- Placeholder images maintain site functionality during transition
- Build process successfully generates static files with new structure

The enhanced site now addresses all the feedback:
- ✅ Focus on personal pictures and actual logos (ready for real images)
- ✅ Enhanced hero section with professional layout
- ✅ Comprehensive Tim & Beth section with detailed copy
- ✅ Estate planning page for annuity services
- ✅ Hiring page for agent recruitment
- ✅ Unified routing structure as requested