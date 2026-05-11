import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { site } from '../../content/site';
import { getLeadTrackingId, trackLeadEvent } from '../../lib/lead-analytics';

export const prerender = false;

const RECIPIENTS = ['tim@legacyf-l.com', 'beth@legacyf-l.com'];

const SERVICE_LABELS: Record<string, string> = {
  'life-insurance': 'Life Insurance',
  'retirement-planning': 'Retirement Planning',
  'estate-planning': 'Estate Planning',
  'annuities': 'Annuities',
  'career-opportunity': 'Career Opportunity',
  'general-consultation': 'General Consultation',
  'other': 'Other',
};

export const POST: APIRoute = async ({ request }) => {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid request body' });
  }

  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const phone = (body.phone ?? '').trim();
  const serviceInterest = (body.service_interest ?? '').trim();
  const message = (body.message ?? '').trim();
  const contactPreference = (body.contact_preference ?? 'email').trim();
  const trackingId = getLeadTrackingId();
  const routePath = '/contact';

  // Basic validation
  if (!name || !email) {
    return json(400, { error: 'Name and email are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: 'Invalid email address' });
  }

  const serviceLabel = SERVICE_LABELS[serviceInterest] || serviceInterest || 'Not specified';
  const firstName = escapeHtml(name.split(' ')[0] ?? 'there');

  const trackContactEvent = (
    eventName: string,
    stage: 'submission' | 'email' | 'error',
    status: 'info' | 'success' | 'warning' | 'error',
    properties: Record<string, unknown> = {},
  ) =>
    trackLeadEvent({
      trackingId,
      route: routePath,
      eventName,
      source: 'server',
      stage,
      status,
      ownerScope: 'legacy',
      leadEmail: email,
      leadPhone: phone || undefined,
      interest: serviceInterest || undefined,
      provider: 'legacy_financial',
      properties,
    });

  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  await trackContactEvent('contact_form_received', 'submission', 'info', {
    client_ip: clientIp,
    contact_preference: contactPreference,
    has_message: Boolean(message),
    has_phone: Boolean(phone),
  });

  // Build internal notification email
  const internalHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
      <div style="background: linear-gradient(135deg, #1e3a5f 0%, #1a62db 100%); border-radius: 12px 12px 0 0; padding: 24px 28px;">
        <h2 style="margin: 0; color: #ffffff; font-size: 22px;">New Website Inquiry</h2>
        <p style="margin: 6px 0 0; color: #bfdbfe; font-size: 14px;">Contact form · legacyfinancial.app</p>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 24px 28px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; width: 160px; border-bottom: 1px solid #f1f5f9;">Name</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(name)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #f1f5f9;">Email</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">
              <a href="mailto:${escapeHtml(email)}" style="color: #1a62db;">${escapeHtml(email)}</a>
            </td>
          </tr>
          ${phone ? `<tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #f1f5f9;">Phone</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">
              <a href="tel:${escapeHtml(phone)}" style="color: #1a62db;">${escapeHtml(phone)}</a>
            </td>
          </tr>` : ''}
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #f1f5f9;">Service Interest</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(serviceLabel)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #f1f5f9;">Contact Preference</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(contactPreference)}</td>
          </tr>
          ${message ? `<tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #f1f5f9;">Message</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; white-space: pre-wrap;">${escapeHtml(message)}</td>
          </tr>` : ''}
        </table>
        <p style="margin: 20px 0 0; padding: 14px; background: #eff6ff; border-radius: 8px; font-size: 13px; color: #1e40af;">
          Reply directly to this email to reach <strong>${firstName}</strong>.
        </p>
      </div>
    </div>
  `;

  const resendKey = import.meta.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error('RESEND_API_KEY is not set — contact form submission logged but email not sent');
    await trackContactEvent('contact_email_skipped', 'email', 'warning', {
      reason: 'no_resend_api_key',
    });
    return json(200, { ok: true });
  }

  try {
    const resend = new Resend(resendKey);
    const result = await resend.emails.send({
      from: 'Legacy F&L Leads <leads@legacyfinancial.app>',
      to: RECIPIENTS,
      subject: `Website Inquiry: ${name}${serviceInterest ? ` — ${serviceLabel}` : ''}`,
      html: internalHtml,
      replyTo: email,
      headers: {
        'X-Legacy-Template': 'contact_form',
        'X-Legacy-Tracking-Id': trackingId,
      },
    });

    if (result.error) {
      console.error('Resend contact form email error:', result.error);
      await trackContactEvent('contact_email_failed', 'email', 'error', {
        reason: result.error.message,
      });
      return json(500, { error: 'Failed to send — please try again or call us directly' });
    }

    await trackContactEvent('contact_email_sent', 'email', 'success', {
      emailId: result.data?.id ?? null,
    });

    return json(200, { ok: true });
  } catch (err) {
    console.error('Contact form send failed:', err);
    await trackContactEvent('contact_pipeline_failed', 'error', 'error', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return json(500, { error: 'Failed to send — please try again or call us directly' });
  }
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
