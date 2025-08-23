# Cal.com Integration Guide

## Overview

This document describes the Cal.com scheduling integration implemented for Legacy Financial & Life. The integration replaces the placeholder scheduling component with a functional Cal.com embed while maintaining the site's branding and user experience.

## Implementation Details

### Files Modified
- `src/components/Scheduling.astro` - Main scheduling component with Cal.com embed
- `src/pages/consultation-success.astro` - Success page for completed bookings

### Features Implemented

#### ✅ Core Requirements
- [x] Cal.com inline embed integration
- [x] Branded styling matching site colors (`#1a62db` brand color)
- [x] Responsive design for desktop and mobile
- [x] Event type configuration for 30-minute consultations
- [x] Fallback content when Cal.com is unavailable
- [x] Success page with confirmation flow
- [x] Email and calendar invite support (via Cal.com)
- [x] Admin notification support (via Cal.com)

#### ✅ User Experience
- [x] Three consultation types displayed:
  - Initial Consultation (30 minutes)
  - Comprehensive Planning Session (60 minutes)
  - Policy Review & Strategy (45 minutes)
- [x] Contact information for direct scheduling
- [x] What to expect section
- [x] Meeting options (phone, video, in-person)
- [x] Mobile-responsive layout

#### ✅ Technical Features
- [x] Graceful fallback when Cal.com script fails to load
- [x] Analytics tracking for successful bookings
- [x] Brand color customization
- [x] Modular component design for reuse

## Setup Instructions

### 1. Cal.com Account Setup
1. Create a Cal.com account at https://cal.com
2. Set up event types:
   - **30-minute Initial Consultation**
     - Duration: 30 minutes
     - Buffer: 15 minutes before/after
     - Required fields: Name, Email, Phone, Short note
   - **60-minute Comprehensive Planning**
   - **45-minute Policy Review**

### 2. Configuration
1. Replace `"your-calcom-username"` in `Scheduling.astro` with your actual Cal.com username
2. Update event type slug from `"30min-consultation"` to match your Cal.com event
3. Customize brand colors if needed (currently using `#1a62db`)

### 3. Testing
1. Test the embed loads correctly
2. Verify booking flow works end-to-end
3. Check email confirmations are sent
4. Test mobile responsiveness

## Customization Options

### Brand Colors
The integration uses CSS custom properties to match Cal.com styling:
```css
--cal-brand-color: #1a62db;
--cal-brand-text-color: #ffffff;
--cal-border-color: #e2e8f0;
--cal-text-color: #1e293b;
```

### Event Configuration
Modify the `config` attribute in the `cal-inline` element:
```html
config='{"layout": "month_view", "theme": "light", "hideEventTypeDetails": false, "styles": {"branding": {"brandColor": "#1a62db"}}}'
```

### Fallback Content
The fallback content is shown when Cal.com is unavailable and can be customized in the `.cal-fallback` section.

## Analytics Integration

The integration includes Google Analytics tracking:
- Event: `consultation_scheduled`
- Category: `engagement`
- Label: `cal_com_booking`

## Future Enhancements

### Planned (Optional)
- [ ] SMS reminders via Twilio integration
- [ ] Supabase logging for appointment tracking
- [ ] Custom intake form integration
- [ ] Advanced booking analytics

### Supabase Integration (When API Keys Available)
```sql
-- Example table structure for booking logs
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cal_booking_id TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  appointment_type TEXT,
  appointment_date TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Troubleshooting

### Cal.com Script Fails to Load
- Check network connectivity
- Verify Cal.com service status
- Fallback content will automatically display

### Booking Not Working
- Verify Cal.com username and event type are correct
- Check Cal.com account availability settings
- Ensure event types are published and available

### Styling Issues
- Check CSS custom properties are applied
- Verify brand colors match site theme
- Test in different browsers and devices

## Contact Information

For questions about this integration:
- Technical: Contact development team
- Cal.com Account: Beth@legacyf-l.com
- Business: (706) 333-5641