# Enhanced GPS Section Setup Guide

## Overview

The Wills & Trust Event page now includes an enhanced GPS section with interactive maps and multiple navigation options. This guide explains how to set up the API keys and configure the enhanced features.

## Current Features

✅ **Already Working (No API Keys Required):**
- Interactive map fallback (basic Google Maps embed)
- Direct navigation links to Google Maps, Apple Maps, and Waze
- Mobile-friendly navigation buttons
- Venue contact information and details
- Parking and accessibility information
- Event-specific information display

🔧 **Enhanced Features (Require API Keys):**
- Full interactive Google Maps with zoom, street view, and custom controls
- MapBox integration with custom styling
- Advanced mapping features and better performance

## Quick Setup Instructions

### Option 1: Use Basic Features (No Setup Required)
The enhanced GPS section works out of the box with basic Google Maps embedding. No API keys are needed for the current functionality.

### Option 2: Enable Advanced Features (API Keys Required)

#### 1. Google Maps API Setup

**Steps to get Google Maps API Key:**

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Sign in with your Google account

2. **Create or Select a Project**
   - Click "Select a project" → "New Project"
   - Enter project name (e.g., "Legacy Financial Maps")
   - Click "Create"

3. **Enable Required APIs**
   - Go to "APIs & Services" → "Library"
   - Search for and enable these APIs:
     - **Maps Embed API** (for embedded maps)
     - **Maps JavaScript API** (for interactive features)
     - **Places API** (for location details)

4. **Create API Key**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy the generated API key

5. **Secure Your API Key (Recommended)**
   - Click on the API key to edit it
   - Under "Application restrictions" → Select "HTTP referrers"
   - Add your domain: `https://legacyf-l.com/*` and `https://legacyf-l.vercel.app/*`
   - Under "API restrictions" → Select "Restrict key"
   - Choose the APIs you enabled above

6. **Add to Environment Variables**
   ```bash
   # Create .env file in your project root
   GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
   ```

#### 2. MapBox Setup (Alternative/Additional Option)

**Steps to get MapBox Access Token:**

1. **Create MapBox Account**
   - Visit: https://account.mapbox.com/
   - Sign up for a free account

2. **Get Access Token**
   - Go to your account dashboard
   - Copy the "Default public token" or create a new one

3. **Add to Environment Variables**
   ```bash
   # Add to .env file
   MAPBOX_ACCESS_TOKEN=your_mapbox_access_token_here
   ```

## Environment Variables Configuration

Create a `.env` file in your project root with your API keys:

```bash
# Google Maps API Key (Optional - for enhanced features)
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# MapBox Access Token (Optional - alternative map provider)
MAPBOX_ACCESS_TOKEN=your_mapbox_access_token_here
```

## Deployment Configuration

### For Vercel:
1. Go to your Vercel project dashboard
2. Click "Settings" → "Environment Variables"
3. Add your API keys:
   - `GOOGLE_MAPS_API_KEY`: `your_google_maps_api_key_here`
   - `MAPBOX_ACCESS_TOKEN`: `your_mapbox_access_token_here`

### For Netlify:
1. Go to your Netlify site dashboard
2. Click "Site settings" → "Environment variables"
3. Add your API keys as above

### For Other Hosts:
Add the environment variables through your hosting provider's control panel or deployment configuration.

## Testing Your Setup

1. **Without API Keys (Basic Mode):**
   - Map shows basic Google Maps embed
   - All navigation buttons work
   - Venue information displays correctly

2. **With Google Maps API Key:**
   - Enhanced interactive map with full controls
   - Better embedding and performance
   - Street view and satellite options

3. **With MapBox Token:**
   - Alternative map provider option
   - Custom styling capabilities
   - Additional mapping features

## Cost Information

### Google Maps API:
- **Free tier:** 28,000 map loads per month
- **Cost:** $7 per 1,000 additional map loads
- **Recommended for:** Most small to medium businesses

### MapBox:
- **Free tier:** 50,000 map loads per month
- **Cost:** $0.50 per 1,000 additional map loads
- **Recommended for:** Higher traffic sites or custom styling needs

## Troubleshooting

### Map Not Loading:
1. Check that your API key is correctly set in environment variables
2. Verify the API key has the correct APIs enabled
3. Check domain restrictions match your site URL
4. Look for console errors in browser developer tools

### Navigation Links Not Working:
- Navigation links work without API keys
- Check that the address format is correct
- Test links manually by copying URLs

### Development vs Production:
- Environment variables need to be set in both environments
- Use different API keys for development and production if needed
- Test thoroughly before deploying to production

## Support

If you encounter issues:
1. Check the browser console for error messages
2. Verify API keys are properly configured
3. Test with the basic setup first (no API keys)
4. Contact your development team for technical support

## Security Notes

- Never commit API keys to version control
- Use environment variables for all sensitive information
- Restrict API keys to your specific domains
- Monitor API usage to prevent unexpected charges
- Consider using different keys for development and production

---

**The enhanced GPS section provides a professional, user-friendly experience for event attendees to find your location easily, whether using basic or advanced features.**