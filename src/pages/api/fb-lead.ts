import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { site } from '../../content/site';
import { getLeadTrackingId, trackLeadEvent } from '../../lib/lead-analytics';
import { buildEmailMetadata, buildTrackedUrl, getMonitoredReplyTo, syncResendContact } from '../../lib/resend-monitoring';

export const prerender = false;

const RECIPIENTS = ['tim@legacyf-l.com', 'beth@legacyf-l.com', 'jarboi6677@gmail.com'];
const LICENSED_STATES = 'Ohio, Georgia, Oklahoma, South Carolina, Mississippi, Michigan, Texas, Utah, Alabama, and Louisiana';

// ── Ringy CRM lead injection ───────────────────────────────────────
// Requires two env vars from the client's Ringy account:
//   RINGY_AUTH_TOKEN – API token from Ringy Dashboard → Settings → API
//   RINGY_API_URL   – Lead injection endpoint (e.g. https://app.ringy.com/api/public/createLead)
async function pushToRingy(lead: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  notes?: string;
}): Promise<void> {
  const token = import.meta.env.RINGY_AUTH_TOKEN;
  const url = import.meta.env.RINGY_API_URL;

  if (!token || !url) return; // silently skip when not configured

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      first_name: lead.firstName,
      last_name: lead.lastName,
      email: lead.email,
      ...(lead.phone && { phone: lead.phone }),
      ...(lead.notes && { notes: lead.notes }),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ringy API ${res.status}: ${body}`);
  }
}

const INTEREST_LABELS: Record<string, string> = {
  'whole-life': 'Whole Life Insurance',
  'final-expense': 'Final Expense / Burial Coverage',
  'wealth': 'Generational Wealth Strategies',
  'not-sure': 'Need help deciding',
};

const TOBACCO_USE_LABELS: Record<string, string> = {
  no: 'No',
  yes: 'Yes',
};

export const POST: APIRoute = async ({ request, redirect }) => {
  const resendKey = import.meta.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error('RESEND_API_KEY is not set');
    return redirect('/quote-error', 302);
  }

  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return redirect('/quote-error', 302);
  }

  const name = String(data.get('name') ?? '').trim();
  const email = normalizeEmailAddress(String(data.get('email') ?? ''));
  const phone = String(data.get('phone') ?? '').trim();
  const dob = buildDobValue(data);
  const height = buildHeightValue(data);
  const weight = normalizeWeightValue(String(data.get('weight') ?? ''));
  const beneficiary = String(data.get('beneficiary') ?? '').trim();
  const state = String(data.get('state') ?? '').trim();
  const interest = String(data.get('interest') ?? '').trim();
  const interestLabel = INTEREST_LABELS[interest] ?? interest;
  const tobaccoUse = String(data.get('tobaccoUse') ?? '').trim();
  const tobaccoUseLabel = TOBACCO_USE_LABELS[tobaccoUse] ?? tobaccoUse;
  const rawFirstName = name.split(' ')[0] ?? 'there';
  const firstName = escapeHtml(rawFirstName);
  const trackingId = getLeadTrackingId(data.get('trackingId'));
  const routePath = '/free-quote';

  const trackQuoteEvent = (
    eventName: string,
    stage: 'submission' | 'contact_sync' | 'email' | 'handoff' | 'error',
    status: 'info' | 'success' | 'warning' | 'error',
    ownerScope: 'legacy' | 'handoff' | 'client' | 'external',
    properties: Record<string, unknown> = {},
  ) => {
    return trackLeadEvent({
      trackingId,
      route: routePath,
      eventName,
      source: 'server',
      stage,
      status,
      ownerScope,
      leadEmail: email || undefined,
      leadPhone: phone || undefined,
      interest: interest || undefined,
      provider: 'legacy_financial',
      properties,
    });
  };

  console.info('Quote lead request received', {
    route: 'free_quote',
    emailDomain: getEmailDomain(email),
    interest,
    hasResendApiKey: Boolean(resendKey),
    hasReplyMonitorAddress: Boolean(import.meta.env.RESEND_REPLY_MONITOR_ADDRESS?.trim()),
    hasContactSegmentId: Boolean(import.meta.env.RESEND_CONTACT_SEGMENT_ID?.trim()),
    hasContactTopicId: Boolean(import.meta.env.RESEND_CONTACT_TOPIC_ID?.trim()),
    hasRingyConfig: Boolean(import.meta.env.RINGY_AUTH_TOKEN?.trim() && import.meta.env.RINGY_API_URL?.trim()),
  });

  await trackQuoteEvent('quote_request_received', 'submission', 'info', 'legacy', {
    emailDomain: getEmailDomain(email),
    hasReplyMonitorAddress: Boolean(import.meta.env.RESEND_REPLY_MONITOR_ADDRESS?.trim()),
    hasContactSegmentId: Boolean(import.meta.env.RESEND_CONTACT_SEGMENT_ID?.trim()),
    hasContactTopicId: Boolean(import.meta.env.RESEND_CONTACT_TOPIC_ID?.trim()),
    hasRingyConfig: Boolean(import.meta.env.RINGY_AUTH_TOKEN?.trim() && import.meta.env.RINGY_API_URL?.trim()),
  });

  // Basic server-side validation — all fields required
  if (!name || !email || !phone || !dob || !height || !weight || !beneficiary || !state || !interest || !tobaccoUse) {
    await trackQuoteEvent('quote_validation_failed', 'error', 'error', 'legacy', {
      reason: 'missing_required_fields',
    });
    return redirect('/quote-error', 302);
  }

  // Simple email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    await trackQuoteEvent('quote_validation_failed', 'error', 'error', 'legacy', {
      reason: 'invalid_email',
    });
    return redirect('/quote-error', 302);
  }

  if (!TOBACCO_USE_LABELS[tobaccoUse]) {
    await trackQuoteEvent('quote_validation_failed', 'error', 'error', 'legacy', {
      reason: 'invalid_tobacco_use',
    });
    return redirect('/quote-error', 302);
  }

  const resend = new Resend(resendKey);
  const internalEmailMetadata = buildEmailMetadata('quote_internal', {
    interest,
    route: 'free_quote',
    tracking_id: trackingId,
  });
  const confirmationEmailMetadata = buildEmailMetadata('quote_confirmation', {
    interest,
    route: 'free_quote',
    tracking_id: trackingId,
  });
  const replyToRecipients = getMonitoredReplyTo(['beth@legacyf-l.com']);
  const analyticsHeaders = {
    'X-Legacy-Tracking-Id': trackingId,
    'X-Legacy-Lead-Email': email,
    'X-Legacy-Route': 'free_quote',
  };

  // ── Internal lead notification email (to Tim & Beth) ──────────────
  const internalHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
      <div style="background: linear-gradient(135deg, #1e3a5f 0%, #1a62db 100%); border-radius: 12px 12px 0 0; padding: 24px 28px;">
        <h2 style="margin: 0; color: #ffffff; font-size: 22px;">New Quote Request</h2>
        <p style="margin: 6px 0 0; color: #bfdbfe; font-size: 14px;">Facebook campaign · /free-quote</p>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 24px 28px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; width: 140px; border-bottom: 1px solid #f1f5f9;">Name</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(name)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #f1f5f9;">Email</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">
              <a href="mailto:${escapeHtml(email)}" style="color: #1a62db;">${escapeHtml(email)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #f1f5f9;">Phone</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">
              <a href="tel:${escapeHtml(phone)}" style="color: #1a62db;">${escapeHtml(phone)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #f1f5f9;">Date of Birth</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(dob)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #f1f5f9;">Height</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(height)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #f1f5f9;">Weight</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(weight)} lbs</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #f1f5f9;">Tobacco Use</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(tobaccoUseLabel)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #f1f5f9;">Beneficiary</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(beneficiary)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #f1f5f9;">State</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(state)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #f1f5f9;">Interest</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9;">${escapeHtml(interestLabel)}</td>
          </tr>
        </table>
        <p style="margin: 20px 0 0; padding: 14px; background: #eff6ff; border-radius: 8px; font-size: 13px; color: #1e40af;">
          A confirmation email was automatically sent to the lead. Reply directly to this email to reach <strong>${firstName}</strong>.
        </p>
      </div>
    </div>
  `;

  // ── Confirmation email (to the person who submitted the form) ─────
  const confirmationHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #1e3a5f 0%, #1a62db 100%); border-radius: 12px 12px 0 0; padding: 32px 28px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 700;">Thank You, ${firstName}!</h1>
        <p style="margin: 10px 0 0; color: #bfdbfe; font-size: 16px;">We received your free quote request</p>
      </div>

      <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 28px;">
        <p style="font-size: 16px; line-height: 1.6; color: #334155; margin-top: 0;">
          You're one step closer to protecting your family and securing your future. A licensed professional from our team will personally review your information and reach out shortly — no pressure, just answers.
        </p>

        <!-- What happens next -->
        <h2 style="font-size: 18px; color: #0f172a; margin: 28px 0 16px; font-weight: 700;">What Happens Next?</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 12px 14px; vertical-align: top; width: 36px;">
              <div style="width: 28px; height: 28px; background: #dbeafe; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; color: #1a62db; font-size: 14px;">1</div>
            </td>
            <td style="padding: 12px 0; color: #475569; font-size: 15px; line-height: 1.5;">
              <strong style="color: #0f172a;">We review your details</strong><br/>We'll identify the best options for your situation and budget.
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 14px; vertical-align: top;">
              <div style="width: 28px; height: 28px; background: #dbeafe; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; color: #1a62db; font-size: 14px;">2</div>
            </td>
            <td style="padding: 12px 0; color: #475569; font-size: 15px; line-height: 1.5;">
              <strong style="color: #0f172a;">A licensed professional will reach out</strong><br/>We'll discuss your quote and answer any questions you have.
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 14px; vertical-align: top;">
              <div style="width: 28px; height: 28px; background: #dbeafe; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; color: #1a62db; font-size: 14px;">3</div>
            </td>
            <td style="padding: 12px 0; color: #475569; font-size: 15px; line-height: 1.5;">
              <strong style="color: #0f172a;">Find the right coverage</strong><br/>We'll help you choose a plan on your timeline — no rush, no hassle.
            </td>
          </tr>
        </table>

        <div style="margin-top: 24px; padding: 16px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;">
          <p style="margin: 0; font-size: 14px; color: #1d4ed8; line-height: 1.6;">
            Keep an eye on your inbox. We'll follow up shortly with the next step. If you need anything sooner, you can reply directly to this email.
          </p>
        </div>

        <!-- What they're interested in -->
        <div style="margin-top: 24px; padding: 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
          <p style="margin: 0; font-size: 14px; color: #166534;">
            <strong>Your interest:</strong> ${escapeHtml(interestLabel)}
          </p>
        </div>
      </div>
    </div>
  `;

  try {
    // Split name into first/last for CRM
    const nameParts = name.split(' ');
    const crmFirstName = nameParts[0];
    const crmLastName = nameParts.slice(1).join(' ') || '';
    let resendContactStatus: 'success' | 'warning' = 'success';
    let ringyStatus: 'skipped' | 'success' | 'warning' = import.meta.env.RINGY_AUTH_TOKEN?.trim() && import.meta.env.RINGY_API_URL?.trim()
      ? 'success'
      : 'skipped';

    // Build a CRM note from form fields
    const noteLines = [
      'Source: Facebook campaign · /free-quote',
      `DOB: ${dob}`,
      `Height: ${height}`,
      `Weight: ${weight} lbs`,
      `Tobacco Use: ${tobaccoUseLabel}`,
      `Beneficiary: ${beneficiary}`,
      `State: ${state}`,
      `Interest: ${interestLabel}`,
    ];

    // Send emails + push to Ringy CRM concurrently
    const [internalResult, confirmationResult] = await Promise.all([
      resend.emails.send({
        from: 'Legacy F&L Leads <leads@legacyfinancial.app>',
        to: RECIPIENTS,
        subject: `New Quote Request: ${name}`,
        html: internalHtml,
        replyTo: email,
        headers: {
          ...internalEmailMetadata.headers,
          ...analyticsHeaders,
        },
        tags: internalEmailMetadata.tags,
      }),
      resend.emails.send({
        from: 'Legacy Financial & Life <hello@legacyfinancial.app>',
        to: [email],
        subject: `${rawFirstName}, we received your quote request!`,
        html: confirmationHtml,
        replyTo: replyToRecipients,
        headers: {
          ...confirmationEmailMetadata.headers,
          ...analyticsHeaders,
        },
        tags: confirmationEmailMetadata.tags,
      }),
      // CRM push — fire-and-forget; failure is logged but never blocks the user
      pushToRingy({
        firstName: crmFirstName,
        lastName: crmLastName,
        email,
        phone: phone || undefined,
        notes: noteLines.join('\n'),
      }).catch(async (err) => {
        ringyStatus = 'warning';
        console.error('Ringy CRM push failed:', err);
        await trackQuoteEvent('quote_ringy_push_failed', 'handoff', 'warning', 'handoff', {
          reason: getErrorMessage(err),
        });
      }),
      syncResendContact({
        email,
        firstName: crmFirstName,
        lastName: crmLastName || undefined,
        properties: {
          source: 'facebook_quote_form',
          interest,
          state,
          beneficiary,
          phone,
          last_quote_request_at: new Date().toISOString(),
        },
      }).catch(async (err) => {
        resendContactStatus = 'warning';
        console.error('Resend contact sync failed:', err);
        await trackQuoteEvent('quote_resend_contact_sync_failed', 'contact_sync', 'warning', 'legacy', {
          reason: getErrorMessage(err),
        });
      }),
    ]);

    console.info('Quote lead pipeline results', {
      route: 'free_quote',
      internalEmailId: internalResult.data?.id ?? null,
      internalEmailError: internalResult.error?.message ?? null,
      confirmationEmailId: confirmationResult.data?.id ?? null,
      confirmationEmailError: confirmationResult.error?.message ?? null,
    });

    await Promise.all([
      trackQuoteEvent(
        internalResult.error ? 'quote_internal_email_failed' : 'quote_internal_email_sent',
        'email',
        internalResult.error ? 'error' : 'success',
        internalResult.error ? 'legacy' : 'handoff',
        {
          template: 'quote_internal',
          emailId: internalResult.data?.id ?? null,
          provider: 'resend',
        },
      ),
      trackQuoteEvent(
        confirmationResult.error ? 'quote_confirmation_email_failed' : 'quote_confirmation_email_sent',
        'email',
        confirmationResult.error ? 'warning' : 'success',
        confirmationResult.error ? 'legacy' : 'handoff',
        {
          template: 'quote_confirmation',
          emailId: confirmationResult.data?.id ?? null,
          provider: 'resend',
        },
      ),
      resendContactStatus === 'success'
        ? trackQuoteEvent('quote_resend_contact_synced', 'contact_sync', 'success', 'legacy', {
            destination: 'resend_contacts',
          })
        : Promise.resolve(false),
      ringyStatus === 'success'
        ? trackQuoteEvent('quote_ringy_push_succeeded', 'handoff', 'success', 'handoff', {
            destination: 'ringy',
          })
        : Promise.resolve(false),
    ]);

    if (internalResult.error) {
      console.error('Resend internal email error:', internalResult.error);
      await trackQuoteEvent('quote_pipeline_failed', 'error', 'error', 'legacy', {
        reason: 'internal_email_send_failed',
        confirmationEmailError: confirmationResult.error?.message ?? null,
        resendContactStatus,
        ringyStatus,
      });
      return redirect('/quote-error', 302);
    }

    if (confirmationResult.error) {
      // Log but don't block — the lead notification already went through
      console.error('Resend confirmation email error:', confirmationResult.error);
    }

    await trackQuoteEvent('quote_lead_handoff_ready', 'handoff', 'success', 'handoff', {
      internalEmailId: internalResult.data?.id ?? null,
      confirmationEmailId: confirmationResult.data?.id ?? null,
      confirmationEmailStatus: confirmationResult.error ? 'warning' : 'success',
      resendContactStatus,
      ringyStatus,
    });

    await trackQuoteEvent('quote_pipeline_completed', 'handoff', confirmationResult.error ? 'warning' : 'success', 'handoff', {
      internalEmailId: internalResult.data?.id ?? null,
      confirmationEmailId: confirmationResult.data?.id ?? null,
      resendContactStatus,
      ringyStatus,
    });
  } catch (err) {
    console.error('Email send failed:', err);
    await trackQuoteEvent('quote_pipeline_failed', 'error', 'error', 'legacy', {
      reason: getErrorMessage(err),
    });
    return redirect('/quote-error', 302);
  }

  return redirect('/quote-success', 302);
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeEmailAddress(value: string): string {
  const trimmed = value.trim();
  const atIndex = trimmed.lastIndexOf('@');

  if (atIndex === -1) {
    return trimmed;
  }

  const localPart = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const normalizedDomain = domain.toLowerCase().replace(/\.comn$/i, '.com');

  return `${localPart}@${normalizedDomain}`;
}

function getEmailDomain(value: string): string {
  const atIndex = value.lastIndexOf('@');
  return atIndex === -1 ? 'invalid' : value.slice(atIndex + 1).toLowerCase();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildDobValue(data: FormData): string {
  const directDob = String(data.get('dob') ?? '').trim();
  if (directDob) {
    return directDob;
  }

  const month = String(data.get('dobMonth') ?? '').trim();
  const day = String(data.get('dobDay') ?? '').trim();
  const year = String(data.get('dobYear') ?? '').trim();

  if (!month || !day || !year) {
    return '';
  }

  if (!/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day) || !/^\d{4}$/.test(year)) {
    return '';
  }

  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const yearNumber = Number(year);

  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || yearNumber < 1900) {
    return '';
  }

  const maxDay = new Date(yearNumber, monthNumber, 0).getDate();
  if (dayNumber > maxDay) {
    return '';
  }

  return `${String(monthNumber).padStart(2, '0')}/${String(dayNumber).padStart(2, '0')}/${year}`;
}

function buildHeightValue(data: FormData): string {
  const feet = String(data.get('heightFeet') ?? '').trim();
  const inches = String(data.get('heightInches') ?? '').trim();

  if (!/^\d$/.test(feet) || !/^\d{1,2}$/.test(inches)) {
    return '';
  }

  const feetNumber = Number(feet);
  const inchesNumber = Number(inches);

  if (feetNumber < 4 || feetNumber > 7 || inchesNumber < 0 || inchesNumber > 11) {
    return '';
  }

  return `${feetNumber} ft ${inchesNumber} in`;
}

function normalizeWeightValue(value: string): string {
  const digitsOnly = value.trim().replace(/\D/g, '');

  if (!/^\d{2,3}$/.test(digitsOnly)) {
    return '';
  }

  const weightNumber = Number(digitsOnly);

  if (weightNumber < 50 || weightNumber > 999) {
    return '';
  }

  return String(weightNumber);
}
