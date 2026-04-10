import { Resend } from 'resend';
import { site } from '../content/site';

type EmailTemplateKey = 'quote_internal' | 'quote_confirmation' | 'resend_alert';
type AlertSeverity = 'info' | 'warning' | 'critical';

type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: Record<string, unknown>;
};

type MonitoringAlert = {
  eventType: string;
  severity: AlertSeverity;
  subject: string;
  text: string;
  html: string;
};

const ALERT_EVENT_TYPES = new Set([
  'email.bounced',
  'email.complained',
  'email.delivery_delayed',
  'email.failed',
  'email.received',
  'email.suppressed',
]);

const TEMPLATE_CONFIG: Record<EmailTemplateKey, { campaign: string; source: string; medium: string }> = {
  quote_internal: {
    campaign: 'free_quote',
    source: 'facebook',
    medium: 'email',
  },
  quote_confirmation: {
    campaign: 'free_quote',
    source: 'resend',
    medium: 'email',
  },
  resend_alert: {
    campaign: 'ops_alerts',
    source: 'resend',
    medium: 'email',
  },
};

const DEFAULT_ALERT_FROM = 'Legacy Financial Alerts <hello@legacyfinancial.app>';

type ContactSyncInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  properties?: Record<string, string | number | null>;
};

type ResendContactRecord = {
  id: string;
  email: string;
};

export function buildTrackedUrl(
  target: string,
  template: Exclude<EmailTemplateKey, 'resend_alert'>,
  content: string,
): string {
  const config = TEMPLATE_CONFIG[template];
  const url = new URL(target, site.url);

  url.searchParams.set('utm_source', config.source);
  url.searchParams.set('utm_medium', config.medium);
  url.searchParams.set('utm_campaign', config.campaign);
  url.searchParams.set('utm_content', sanitizeTagValue(content));

  return url.toString();
}

export function buildEmailMetadata(
  template: Exclude<EmailTemplateKey, 'resend_alert'>,
  extraTags: Record<string, string> = {},
): { headers: Record<string, string>; tags: Array<{ name: string; value: string }> } {
  const config = TEMPLATE_CONFIG[template];
  const tags = Object.entries({
    template,
    campaign: config.campaign,
    source: config.source,
    medium: config.medium,
    ...extraTags,
  })
    .map(([name, value]) => ({
      name: sanitizeTagName(name),
      value: sanitizeTagValue(value),
    }))
    .filter(({ name, value }) => Boolean(name) && Boolean(value));

  return {
    headers: {
      'X-Legacy-Template': template,
      'X-Legacy-Campaign': config.campaign,
      'X-Legacy-Source': config.source,
    },
    tags,
  };
}

export function getMonitoredReplyTo(recipients: string[]): string | string[] | undefined {
  const monitorAddress = import.meta.env.RESEND_REPLY_MONITOR_ADDRESS?.trim();
  const uniqueRecipients = Array.from(
    new Set([monitorAddress, ...recipients].filter((value): value is string => Boolean(value?.trim()))),
  );

  if (uniqueRecipients.length === 0) {
    return undefined;
  }

  return uniqueRecipients.length === 1 ? uniqueRecipients[0] : uniqueRecipients;
}

export async function syncResendContact(input: ContactSyncInput): Promise<boolean> {
  const resendKey = import.meta.env.RESEND_API_KEY;
  const email = normalizeEmail(input.email);

  if (!resendKey || !email) {
    console.warn('Resend contact sync skipped', {
      hasResendApiKey: Boolean(resendKey),
      hasEmail: Boolean(email),
    });
    return false;
  }

  const segmentId = import.meta.env.RESEND_CONTACT_SEGMENT_ID?.trim();
  const topicId = import.meta.env.RESEND_CONTACT_TOPIC_ID?.trim();
  const properties = sanitizeContactProperties(input.properties);

  console.info('Resend contact sync started', {
    email: maskEmail(email),
    hasSegmentId: Boolean(segmentId),
    hasTopicId: Boolean(topicId),
    propertyKeys: Object.keys(properties ?? {}),
  });

  const existingContact = await getResendContactByEmail(resendKey, email);

  if (!existingContact) {
    const createPayload = {
      email,
      firstName: input.firstName,
      lastName: input.lastName,
      properties,
      ...(segmentId ? { segments: [{ id: segmentId }] } : {}),
      ...(topicId ? { topics: [{ id: topicId, subscription: 'opt_in' as const }] } : {}),
    };

    const createdContact = await createResendContactWithFallback(resendKey, createPayload);

    console.info('Resend contact created', {
      email: maskEmail(email),
      contactId: createdContact.id,
      segmentAttached: Boolean(segmentId),
      topicAttached: Boolean(topicId),
    });
    return true;
  }

  const updatedContact = await updateResendContactWithFallback(resendKey, {
    email,
    firstName: input.firstName,
    lastName: input.lastName,
    properties,
  });

  console.info('Resend contact updated', {
    email: maskEmail(email),
    contactId: updatedContact.id,
    segmentAttached: false,
    topicAttached: false,
  });

  if (segmentId || topicId) {
    console.warn('Resend contact exists; segment/topic assignment is only applied on create with the current Contacts API integration', {
      email: maskEmail(email),
      hasSegmentId: Boolean(segmentId),
      hasTopicId: Boolean(topicId),
    });
  }

  return true;
}

async function getResendContactByEmail(resendKey: string, email: string): Promise<ResendContactRecord | null> {
  const response = await resendContactsRequest<ResendContactRecord>(resendKey, 'GET', `/contacts/${encodeURIComponent(email)}`);
  return response.status === 404 ? null : response.data;
}

async function createResendContact(
  resendKey: string,
  payload: {
    email: string;
    firstName?: string;
    lastName?: string;
    properties?: Record<string, string | number | null>;
    segments?: Array<{ id: string }>;
    topics?: Array<{ id: string; subscription: 'opt_in' | 'opt_out' }>;
  },
): Promise<ResendContactRecord> {
  const response = await resendContactsRequest<ResendContactRecord>(resendKey, 'POST', '/contacts', payload);
  return response.data;
}

async function createResendContactWithFallback(
  resendKey: string,
  payload: {
    email: string;
    firstName?: string;
    lastName?: string;
    properties?: Record<string, string | number | null>;
    segments?: Array<{ id: string }>;
    topics?: Array<{ id: string; subscription: 'opt_in' | 'opt_out' }>;
  },
): Promise<ResendContactRecord> {
  try {
    return await createResendContact(resendKey, payload);
  } catch (error) {
    if (!payload.properties || !isUndefinedResendPropertyError(error)) {
      throw error;
    }

    console.warn('Resend contact create rejected custom properties; retrying without properties', {
      email: maskEmail(payload.email),
      propertyKeys: Object.keys(payload.properties),
    });

    const { properties: _properties, ...payloadWithoutProperties } = payload;
    return createResendContact(resendKey, payloadWithoutProperties);
  }
}

async function updateResendContact(
  resendKey: string,
  payload: {
    email: string;
    firstName?: string;
    lastName?: string;
    properties?: Record<string, string | number | null>;
  },
): Promise<ResendContactRecord> {
  const response = await resendContactsRequest<ResendContactRecord>(
    resendKey,
    'PATCH',
    `/contacts/${encodeURIComponent(payload.email)}`,
    payload,
  );
  return response.data;
}

async function updateResendContactWithFallback(
  resendKey: string,
  payload: {
    email: string;
    firstName?: string;
    lastName?: string;
    properties?: Record<string, string | number | null>;
  },
): Promise<ResendContactRecord> {
  try {
    return await updateResendContact(resendKey, payload);
  } catch (error) {
    if (!payload.properties || !isUndefinedResendPropertyError(error)) {
      throw error;
    }

    console.warn('Resend contact update rejected custom properties; retrying without properties', {
      email: maskEmail(payload.email),
      propertyKeys: Object.keys(payload.properties),
    });

    const { properties: _properties, ...payloadWithoutProperties } = payload;
    return updateResendContact(resendKey, payloadWithoutProperties);
  }
}

async function resendContactsRequest<T>(
  resendKey: string,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: Record<string, unknown>,
): Promise<{ data: T; status: number }> {
  const response = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const responseText = await response.text();
  const parsed = parseJsonResponse(responseText);

  if (!response.ok) {
    if (response.status === 404) {
      return { data: null as T, status: 404 };
    }

    throw new Error(buildResendApiErrorMessage(response.status, parsed, responseText));
  }

  return {
    data: parsed as T,
    status: response.status,
  };
}

function parseJsonResponse(value: string): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function buildResendApiErrorMessage(status: number, parsed: unknown, fallback: string): string {
  const record = getNestedRecord(parsed);
  const fallbackMessage = fallback.trim() || 'Unknown Resend API error';
  const message = getStringValue(record?.message) ?? getStringValue(record?.error) ?? fallbackMessage;
  const name = getStringValue(record?.name);

  return name ? `Resend API ${status} ${name}: ${message}` : `Resend API ${status}: ${message}`;
}

function isUndefinedResendPropertyError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /validation_error/i.test(error.message) && /properties do not exist/i.test(error.message);
}

function maskEmail(value: string): string {
  const [localPart, domain = 'unknown'] = value.split('@');

  if (!localPart) {
    return `***@${domain}`;
  }

  const visible = localPart.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(localPart.length - visible.length, 1))}@${domain}`;
}

export async function processResendWebhookEvent(event: ResendWebhookEvent): Promise<boolean> {
  if (event.type === 'email.received') {
    const contact = extractInboundContact(event);
    if (contact) {
      await syncResendContact(contact).catch((error) => {
        console.error('Failed to sync inbound Resend contact', error);
      });
    }
  }

  if (!ALERT_EVENT_TYPES.has(event.type) || isInternalAlertEvent(event)) {
    return false;
  }

  const alert = buildMonitoringAlert(event);
  if (!alert) {
    return false;
  }

  await dispatchMonitoringAlert(alert, event);
  return true;
}

function buildMonitoringAlert(event: ResendWebhookEvent): MonitoringAlert | null {
  const data = getEventData(event);
  const subject = getStringValue(data.subject) ?? 'No subject';
  const recipients = formatAddressList(data.to);
  const sender = getStringValue(data.from) ?? 'Unknown sender';
  const emailId = getStringValue(data.email_id) ?? getStringValue(data.id) ?? 'unknown';
  const tags = formatTags(data.tags);
  const summaryLines = [
    `Event: ${event.type}`,
    `Created: ${event.created_at ?? 'unknown'}`,
    `Email ID: ${emailId}`,
    `From: ${sender}`,
    `To: ${recipients}`,
    `Subject: ${subject}`,
  ];

  if (tags) {
    summaryLines.push(`Tags: ${tags}`);
  }

  if (event.type === 'email.received') {
    const replyPreview = getReplyPreview(data);
    if (replyPreview) {
      summaryLines.push(`Reply preview: ${replyPreview}`);
    }

    return {
      eventType: event.type,
      severity: 'warning',
      subject: `[Lead Reply] ${subject}`,
      text: ['A monitored reply was received and needs follow-up.', ...summaryLines].join('\n'),
      html: renderAlertHtml('A monitored reply was received and needs follow-up.', summaryLines, 'warning'),
    };
  }

  const bounce = getNestedRecord(data.bounce);
  if (bounce) {
    const bounceMessage = getStringValue(bounce.message);
    const bounceType = getStringValue(bounce.type);
    const bounceSubType = getStringValue(bounce.subType);

    if (bounceType || bounceSubType || bounceMessage) {
      summaryLines.push(
        `Delivery detail: ${[bounceType, bounceSubType, bounceMessage].filter(Boolean).join(' | ')}`,
      );
    }
  }

  const severity: AlertSeverity = event.type === 'email.delivery_delayed' ? 'warning' : 'critical';
  const intro =
    event.type === 'email.delivery_delayed'
      ? 'A quote-related email is delayed in transit and may need manual follow-up.'
      : 'A quote-related Resend event needs attention.';

  return {
    eventType: event.type,
    severity,
    subject: `[Resend ${severity.toUpperCase()}] ${event.type}`,
    text: [intro, ...summaryLines].join('\n'),
    html: renderAlertHtml(intro, summaryLines, severity),
  };
}

async function dispatchMonitoringAlert(alert: MonitoringAlert, event: ResendWebhookEvent): Promise<void> {
  const tasks: Array<Promise<void>> = [];
  const webhookUrl = import.meta.env.RESEND_ALERT_WEBHOOK_URL?.trim();
  const alertRecipients = parseCsv(import.meta.env.RESEND_ALERT_RECIPIENTS);
  const resendKey = import.meta.env.RESEND_API_KEY;

  if (webhookUrl) {
    tasks.push(sendAlertWebhook(webhookUrl, alert, event));
  }

  if (alertRecipients.length > 0 && resendKey) {
    tasks.push(sendAlertEmail(resendKey, alertRecipients, alert));
  }

  if (tasks.length === 0) {
    console.warn('Resend monitoring event received but no alert destination is configured.', {
      eventType: alert.eventType,
    });
    return;
  }

  const results = await Promise.allSettled(tasks);
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');

  if (failures.length > 0) {
    throw new Error(
      failures
        .map((failure) => (failure.reason instanceof Error ? failure.reason.message : String(failure.reason)))
        .join('; '),
    );
  }
}

async function sendAlertWebhook(
  webhookUrl: string,
  alert: MonitoringAlert,
  event: ResendWebhookEvent,
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: 'legacy-financial-and-life',
      severity: alert.severity,
      eventType: alert.eventType,
      subject: alert.subject,
      text: alert.text,
      event,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Alert webhook failed with ${response.status}: ${body}`);
  }
}

async function sendAlertEmail(
  resendKey: string,
  recipients: string[],
  alert: MonitoringAlert,
): Promise<void> {
  const resend = new Resend(resendKey);
  const result = await resend.emails.send({
    from: import.meta.env.RESEND_ALERT_FROM?.trim() || DEFAULT_ALERT_FROM,
    to: recipients,
    subject: alert.subject,
    text: alert.text,
    html: alert.html,
    tags: [
      { name: 'template', value: 'resend_alert' },
      { name: 'event_type', value: sanitizeTagValue(alert.eventType.replace(/\./g, '_')) },
      { name: 'severity', value: sanitizeTagValue(alert.severity) },
    ],
    headers: {
      'X-Legacy-Template': 'resend_alert',
      'X-Legacy-Event-Type': alert.eventType,
      'X-Legacy-Severity': alert.severity,
    },
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}

function isInternalAlertEvent(event: ResendWebhookEvent): boolean {
  const data = getEventData(event);
  const tags = getNestedRecord(data.tags);
  return getStringValue(tags?.template) === 'resend_alert';
}

function getEventData(event: ResendWebhookEvent): Record<string, unknown> {
  return getNestedRecord(event.data) ?? {};
}

function getReplyPreview(data: Record<string, unknown>): string | null {
  const rawText = getStringValue(data.text);
  if (!rawText) {
    return null;
  }

  return rawText.replace(/\s+/g, ' ').trim().slice(0, 280);
}

function extractInboundContact(event: ResendWebhookEvent): ContactSyncInput | null {
  const data = getEventData(event);
  const fromValue = getStringValue(data.from);

  if (!fromValue) {
    return null;
  }

  const parsedAddress = parseEmailAddress(fromValue);
  if (!parsedAddress) {
    return null;
  }

  const parsedName = parseDisplayName(fromValue);
  const [firstName, ...lastParts] = parsedName ? parsedName.split(/\s+/) : [];

  return {
    email: parsedAddress,
    firstName: firstName || undefined,
    lastName: lastParts.join(' ') || undefined,
    properties: {
      source: 'resend_inbound',
      last_inbound_event_at: event.created_at ?? null,
    },
  };
}

function renderAlertHtml(intro: string, lines: string[], severity: AlertSeverity): string {
  const accent = severity === 'critical' ? '#b91c1c' : severity === 'warning' ? '#b45309' : '#0f766e';
  const rows = lines
    .map((line) => `<li style="margin: 0 0 8px;">${escapeHtml(line)}</li>`)
    .join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #0f172a;">
      <div style="border-radius: 12px 12px 0 0; background: ${accent}; color: #ffffff; padding: 20px 24px;">
        <h1 style="margin: 0; font-size: 20px;">${escapeHtml(intro)}</h1>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 20px 24px; background: #ffffff;">
        <ul style="padding-left: 18px; margin: 0; line-height: 1.6; color: #334155;">
          ${rows}
        </ul>
      </div>
    </div>
  `;
}

function formatAddressList(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).join(', ') || 'Unknown recipients';
  }

  return getStringValue(value) ?? 'Unknown recipients';
}

function formatTags(value: unknown): string {
  const record = getNestedRecord(value);
  if (!record) {
    return '';
  }

  return Object.entries(record)
    .map(([name, entryValue]) => `${name}=${String(entryValue)}`)
    .join(', ');
}

function getNestedRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeContactProperties(
  value: ContactSyncInput['properties'],
): Record<string, string | number | null> | undefined {
  if (!value) {
    return undefined;
  }

  const entries = Object.entries(value).filter(([, entryValue]) => {
    return entryValue === null || typeof entryValue === 'string' || typeof entryValue === 'number';
  });

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parseEmailAddress(value: string): string | null {
  const bracketMatch = value.match(/<([^>]+)>/);
  const candidate = bracketMatch?.[1] ?? value;
  const normalized = normalizeEmail(candidate);

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function parseDisplayName(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/"/g, '').trim();
}

function sanitizeTagName(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 256);
}

function sanitizeTagValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 256) || 'unknown';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}