-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Add content campaign support to sales_campaigns
-- Run in Supabase SQL Editor (Legacy Financial: kxmojndpgxgbykxjtxba)
-- Safe to re-run — uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
--
-- Enables "video" and "content" campaign types alongside existing
-- quote-based campaigns. Tim can create a campaign that sends a
-- video link (e.g., estate planning overview) to targeted prospects.
-- ═══════════════════════════════════════════════════════════════════

-- Add campaign_type column (default 'quote' for backward compat)
ALTER TABLE sales_campaigns
  ADD COLUMN IF NOT EXISTS campaign_type TEXT NOT NULL DEFAULT 'quote';
-- Values: 'quote' (existing behavior), 'video', 'content'

-- Add content fields for video/content campaigns
ALTER TABLE sales_campaigns
  ADD COLUMN IF NOT EXISTS content_url TEXT;
-- The video/content URL to send (e.g., https://umustsee.net/VWT7SB)

ALTER TABLE sales_campaigns
  ADD COLUMN IF NOT EXISTS content_title TEXT;
-- Display title for the content (e.g., "Estate Planning Overview")

ALTER TABLE sales_campaigns
  ADD COLUMN IF NOT EXISTS content_description TEXT;
-- Brief teaser shown in the email body

-- Add index for campaign_type filtering
CREATE INDEX IF NOT EXISTS idx_sales_campaigns_type
  ON sales_campaigns (campaign_type);

-- Comment for documentation
COMMENT ON COLUMN sales_campaigns.campaign_type IS 'quote=standard sales email, video=video link campaign, content=generic content share';
COMMENT ON COLUMN sales_campaigns.content_url IS 'URL of video or content asset to promote (required for video/content campaign types)';
COMMENT ON COLUMN sales_campaigns.content_title IS 'Human-readable title for the content shown in email';
COMMENT ON COLUMN sales_campaigns.content_description IS 'Brief teaser/description shown in email body before the CTA';
