/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly GOOGLE_MAPS_API_KEY?: string;
	readonly MAPBOX_ACCESS_TOKEN?: string;
	readonly RESEND_API_KEY?: string;
	readonly RESEND_ALERT_FROM?: string;
	readonly RESEND_ALERT_RECIPIENTS?: string;
	readonly RESEND_ALERT_WEBHOOK_URL?: string;
	readonly RESEND_CONTACT_SEGMENT_ID?: string;
	readonly RESEND_CONTACT_TOPIC_ID?: string;
	readonly RESEND_REPLY_MONITOR_ADDRESS?: string;
	readonly RESEND_WEBHOOK_SECRET?: string;
	readonly RINGY_AUTH_TOKEN?: string;
	readonly RINGY_SID?: string;
	readonly CALENDLY_BOOKING_URL?: string;
	readonly SUPABASE_LEAD_ANALYTICS_TABLE?: string;
	readonly SUPABASE_SERVICE_ROLE_KEY?: string;
	readonly SUPABASE_URL?: string;

	// Feature flags
	readonly FLAGS_SECRET?: string;
	readonly FLAG_QUOTE_FLOW_VARIANT?: string;
	readonly FLAG_QUOTE_CONFIRMATION_VARIANT?: string;
	readonly FLAG_RINGY_ENABLED?: string;

	// Analytics dashboard auth
	readonly ANALYTICS_ALLOWED_EMAILS?: string;
	readonly ANALYTICS_SECRET?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}