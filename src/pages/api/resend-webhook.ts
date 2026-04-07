import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { processResendWebhookEvent } from '../../lib/resend-monitoring';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const webhookSecret = import.meta.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('RESEND_WEBHOOK_SECRET is not set');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing webhook signature headers', { status: 400 });
  }

  const payload = await request.text();
  const resend = new Resend();

  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: svixId,
        timestamp: svixTimestamp,
        signature: svixSignature,
      },
      webhookSecret,
    });
  } catch (error) {
    console.error('Invalid Resend webhook signature', error);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    const alerted = await processResendWebhookEvent(event as { type: string; created_at?: string; data?: Record<string, unknown> });
    return Response.json({ ok: true, type: event.type, alerted });
  } catch (error) {
    console.error('Failed to process Resend webhook event', error);
    return new Response('Webhook processing failed', { status: 500 });
  }
};

export const GET: APIRoute = async () => new Response('Method not allowed', { status: 405 });