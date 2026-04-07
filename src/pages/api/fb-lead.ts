import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { site } from '../../content/site';
import { buildEmailMetadata, buildTrackedUrl, getMonitoredReplyTo, syncResendContact } from '../../lib/resend-monitoring';

export const prerender = false;

const RECIPIENTS = ['tim@legacyf-l.com', 'beth@legacyf-l.com'];

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
  'not-sure': 'Not sure yet — help me decide',
};

export const POST: APIRoute = async ({ request, redirect }) => {
  const resendKey = import.meta.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error('RESEND_API_KEY is not set');
    return redirect('/form-error', 302);
  }

  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return redirect('/form-error', 302);
  }

  const name = String(data.get('name') ?? '').trim();
  const email = String(data.get('email') ?? '').trim();
  const phone = String(data.get('phone') ?? '').trim();
  const dob = String(data.get('dob') ?? '').trim();
  const beneficiary = String(data.get('beneficiary') ?? '').trim();
  const state = String(data.get('state') ?? '').trim();
  const interest = String(data.get('interest') ?? '').trim();
  const interestLabel = INTEREST_LABELS[interest] ?? interest;
  const rawFirstName = name.split(' ')[0] ?? 'there';
  const firstName = escapeHtml(rawFirstName);

  // Basic server-side validation — all fields required
  if (!name || !email || !phone || !dob || !beneficiary || !state || !interest) {
    return redirect('/form-error', 302);
  }

  // Simple email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return redirect('/form-error', 302);
  }

  const resend = new Resend(resendKey);
  const internalEmailMetadata = buildEmailMetadata('quote_internal', {
    interest,
    route: 'free_quote',
  });
  const confirmationEmailMetadata = buildEmailMetadata('quote_confirmation', {
    interest,
    route: 'free_quote',
  });
  const scheduleUrl = buildTrackedUrl('/schedule', 'quote_confirmation', 'schedule_cta');
  const websiteUrl = buildTrackedUrl('/', 'quote_confirmation', 'site_cta');
  const privacyUrl = buildTrackedUrl('/privacy', 'quote_confirmation', 'privacy_link');
  const replyToRecipients = getMonitoredReplyTo(['beth@legacyf-l.com']);

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

        <!-- What they're interested in -->
        <div style="margin-top: 24px; padding: 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
          <p style="margin: 0; font-size: 14px; color: #166534;">
            <strong>Your interest:</strong> ${escapeHtml(interestLabel)}
          </p>
        </div>

        <!-- CTA -->
        <div style="margin-top: 28px; text-align: center;">
          <p style="font-size: 14px; color: #334155; margin: 0 0 12px;">Want to move faster? Pick a time or reply to this email and we'll work around your schedule.</p>
          <a href="${escapeHtml(scheduleUrl)}" style="display: inline-block; background: #0f172a; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; margin: 0 8px 12px;">
            Schedule a Call
          </a>
          <a href="${escapeHtml(websiteUrl)}" style="display: inline-block; background: #eff6ff; color: #1d4ed8; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; margin: 0 8px 12px;">
            Visit Our Website
          </a>
        </div>

        <div style="margin-top: 8px; text-align: center;">
          <p style="font-size: 14px; color: #64748b; margin: 0 0 12px;">Can't wait? Give us a call anytime:</p>
          <a href="tel:7063335641" style="display: inline-block; background: #1a62db; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            Call ${escapeHtml(site.phone)}
          </a>
        </div>

        <!-- Divider -->
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0;" />

        <!-- About us -->
        <table style="width: 100%;">
          <tr>
            <td style="vertical-align: top; padding-right: 16px;">
              <p style="margin: 0 0 4px; font-weight: 700; color: #0f172a; font-size: 15px;">Your Insurance Team</p>
              <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;">
                Legacy Financial &amp; Life<br/>
                Life, Medicare, Estate Planning &amp; Retirement Strategists<br/>
                Licensed in Georgia · Serving families since 2009
              </p>
            </td>
          </tr>
        </table>
      </div>

      <!-- Footer -->
      <div style="text-align: center; padding: 20px 28px;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.6;">
          &copy; ${new Date().getFullYear()} Legacy Financial &amp; Life. All rights reserved.<br/>
          Licensed in GA. This email is for informational purposes. Policies and features vary by carrier and state.<br/>
          <a href="${escapeHtml(privacyUrl)}" style="color: #64748b;">Privacy Policy</a>
        </p>
      </div>
    </div>
  `;

  try {
    // Split name into first/last for CRM
    const nameParts = name.split(' ');
    const crmFirstName = nameParts[0];
    const crmLastName = nameParts.slice(1).join(' ') || '';

    // Build a CRM note from form fields
    const noteLines = [
      'Source: Facebook campaign · /free-quote',
      `DOB: ${dob}`,
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
        headers: internalEmailMetadata.headers,
        tags: internalEmailMetadata.tags,
      }),
      resend.emails.send({
        from: 'Legacy Financial & Life <hello@legacyfinancial.app>',
        to: [email],
        subject: `${rawFirstName}, we received your quote request!`,
        html: confirmationHtml,
        replyTo: replyToRecipients,
        headers: confirmationEmailMetadata.headers,
        tags: confirmationEmailMetadata.tags,
      }),
      // CRM push — fire-and-forget; failure is logged but never blocks the user
      pushToRingy({
        firstName: crmFirstName,
        lastName: crmLastName,
        email,
        phone: phone || undefined,
        notes: noteLines.join('\n'),
      }).catch((err) => console.error('Ringy CRM push failed:', err)),
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
      }).catch((err) => console.error('Resend contact sync failed:', err)),
    ]);

    if (internalResult.error) {
      console.error('Resend internal email error:', internalResult.error);
      return redirect('/form-error', 302);
    }

    if (confirmationResult.error) {
      // Log but don't block — the lead notification already went through
      console.error('Resend confirmation email error:', confirmationResult.error);
    }
  } catch (err) {
    console.error('Email send failed:', err);
    return redirect('/form-error', 302);
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
