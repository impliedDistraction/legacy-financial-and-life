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
	readonly RINGY_API_URL?: string;
	readonly RINGY_AUTH_TOKEN?: string;
	readonly SUPABASE_LEAD_ANALYTICS_TABLE?: string;
	readonly SUPABASE_SERVICE_ROLE_KEY?: string;
	readonly SUPABASE_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}