import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const prerender = false;

const RECIPIENTS = ['tim@legacyf-l.com', 'beth@legacyf-l.com'];

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
  const age = String(data.get('age') ?? '').trim();
  const interest = String(data.get('interest') ?? '').trim();

  // Basic server-side validation
  if (!name || !email) {
    return redirect('/form-error', 302);
  }

  // Simple email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return redirect('/form-error', 302);
  }

  const resend = new Resend(resendKey);

  // Build a clean lead notification email
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a62db; border-bottom: 2px solid #1a62db; padding-bottom: 8px;">
        New Facebook Lead
      </h2>
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <tr><td style="padding: 8px 0; font-weight: bold; width: 140px;">Name</td><td>${escapeHtml(name)}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: bold;">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        ${phone ? `<tr><td style="padding: 8px 0; font-weight: bold;">Phone</td><td><a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></td></tr>` : ''}
        ${age ? `<tr><td style="padding: 8px 0; font-weight: bold;">Age Range</td><td>${escapeHtml(age)}</td></tr>` : ''}
        ${interest ? `<tr><td style="padding: 8px 0; font-weight: bold;">Interest</td><td>${escapeHtml(interest)}</td></tr>` : ''}
      </table>
      <p style="margin-top: 24px; padding: 12px; background: #eff8ff; border-radius: 8px; font-size: 14px; color: #183f8a;">
        This lead came from the Facebook campaign landing page (<code>/free-quote</code>).
      </p>
      <!-- HOOK: Persist this lead to a database or CRM here -->
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: 'Legacy F&L Leads <leads@legacyfinancial.app>',
      to: RECIPIENTS,
      subject: `New FB Lead: ${name}`,
      html,
      replyTo: email,
    });

    if (error) {
      console.error('Resend error:', error);
      return redirect('/form-error', 302);
    }
  } catch (err) {
    console.error('Email send failed:', err);
    return redirect('/form-error', 302);
  }

  // TODO: Persist lead to database/CRM here before redirecting

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
