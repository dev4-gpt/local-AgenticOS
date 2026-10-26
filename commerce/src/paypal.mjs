/** Server-only PayPal boundary. No environment reads or automatic retries. Sandbox is pinned. */
import { CommerceError, usdValue, sha256 } from './proposals.mjs';
const BASE = 'https://api-m.sandbox.paypal.com';
const bad = code => { throw new CommerceError(code); };
const object = v => v && typeof v === 'object' && !Array.isArray(v);
function identifier(v) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(v)) bad('invalid_provider_reference');
  return v;
}
function operationId(v) {
  if (typeof v !== 'string' || !/^[a-zA-Z0-9-]{8,38}$/.test(v)) bad('invalid_operation_id');
  return v;
}

/** Bounded stream parser: never include provider bodies, credentials or arbitrary errors in messages. */
async function readJson(response) {
  if (!response.body) bad('provider_invalid_response');
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 128_000) { await reader.cancel(); bad('provider_invalid_response'); }
      chunks.push(value);
    }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!object(result)) bad('provider_invalid_response');
    return result;
  } catch { bad('provider_invalid_response'); }
  finally { reader.releaseLock(); }
}

function expectedOrder(input) {
  if (!object(input)) bad('invalid_payment_intent');
  usdValue(input.depositCents);
  return {
    intentId: identifier(input.intentId), merchantId: identifier(input.merchantId),
    depositCents: input.depositCents,
  };
}

/** Validate every returned unit against stored server expectations; one USD deposit only. */
export function inspectOrder(raw, expected) {
  const e = expectedOrder(expected);
  if (!object(raw) || raw.intent !== 'CAPTURE' || !Array.isArray(raw.purchase_units) || raw.purchase_units.length !== 1) bad('provider_order_mismatch');
  const orderId = identifier(raw.id);
  if (expected.orderId !== undefined && expected.orderId !== orderId) bad('provider_order_mismatch');
  const unit = raw.purchase_units[0];
  if (!object(unit) || unit.reference_id !== e.intentId || unit.custom_id !== e.intentId || unit.payee?.merchant_id !== e.merchantId || unit.amount?.currency_code !== 'USD' || unit.amount?.value !== usdValue(e.depositCents)) bad('provider_order_mismatch');
  if (!['CREATED','SAVED','APPROVED','VOIDED','COMPLETED','PAYER_ACTION_REQUIRED'].includes(raw.status)) bad('provider_invalid_response');
  const captures = unit.payments?.captures ?? [];
  if (!Array.isArray(captures) || captures.length > 1) bad('provider_capture_mismatch');
  let capture = null;
  if (captures.length) {
    const c = captures[0];
    if (!object(c) || c.amount?.currency_code !== 'USD' || c.amount?.value !== usdValue(e.depositCents) || c.final_capture !== true || !['COMPLETED','PENDING','DECLINED','FAILED','REFUNDED','PARTIALLY_REFUNDED'].includes(c.status)) bad('provider_capture_mismatch');
    capture = Object.freeze({ id:identifier(c.id), status:c.status });
  }
  if (raw.status === 'COMPLETED' && !capture) bad('provider_capture_mismatch');
  let approvalUrl = null;
  if (Array.isArray(raw.links)) {
    const links = raw.links.filter(l => l?.rel === 'approve' || l?.rel === 'payer-action');
    if (links.length > 1) bad('provider_invalid_response');
    if (links.length) {
      let url; try { url = new URL(links[0].href); } catch { bad('provider_invalid_response'); }
      if (url.protocol !== 'https:' || url.hostname !== 'www.sandbox.paypal.com' || url.port || url.username || url.password || !['/checkoutnow','/webapps/hermes'].includes(url.pathname) || url.searchParams.get('token') !== orderId) bad('provider_invalid_response');
      approvalUrl = url.href;
    }
  }
  return Object.freeze({ environment:'sandbox', intentId:e.intentId, merchantId:e.merchantId, depositCents:e.depositCents, orderId, status:raw.status, capture, approvalUrl });
}

export function createPayPalClient({ clientId, clientSecret, webhookId, fetchImpl = fetch, timeoutMs = 10_000 }) {
  if (typeof clientId !== 'string' || !/^[A-Za-z0-9_-]{3,256}$/.test(clientId) || typeof clientSecret !== 'string' || !/^[A-Za-z0-9_-]{3,512}$/.test(clientSecret)) bad('provider_not_configured');
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) bad('provider_not_configured');

  async function request(path, options, mutation = false) {
    try {
      const response = await fetchImpl(`${BASE}${path}`, { ...options, redirect:'error', signal:AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        await response.body?.cancel();
        bad(mutation ? 'provider_reconciliation_required' : 'provider_unavailable');
      }
      return await readJson(response);
    } catch (error) {
      // Even an unreadable success response can hide a completed mutation. Reconcile it.
      if (mutation) bad('provider_reconciliation_required');
      if (error instanceof CommerceError) throw error;
      bad('provider_unavailable');
    }
  }
  async function token() {
    const value = await request('/v1/oauth2/token', {
      method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded', Authorization:`Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` },
      body:'grant_type=client_credentials',
    });
    if (typeof value.access_token !== 'string' || !/^[A-Za-z0-9._~-]{1,4096}$/.test(value.access_token) || value.token_type?.toLowerCase() !== 'bearer') bad('provider_invalid_response');
    return value.access_token;
  }
  async function api(path, method, body, requestId) {
    const accessToken = await token();
    return request(path, {
      method, headers:{ Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json', Prefer:'return=representation', ...(requestId ? {'PayPal-Request-Id':operationId(requestId)} : {}) },
      ...(body !== undefined ? {body:JSON.stringify(body)} : {}),
    }, method === 'POST' && path.startsWith('/v2/checkout/orders'));
  }
  return Object.freeze({
    environment:'sandbox',
    async checkWebhookConfiguration() {
      identifier(webhookId);
      const raw=await api(`/v1/notifications/webhooks/${encodeURIComponent(webhookId)}`,'GET');
      let url;try{url=new URL(raw.url);}catch{bad('provider_invalid_response');}
      const required=['PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.PENDING','PAYMENT.CAPTURE.DENIED','PAYMENT.CAPTURE.REVERSED'];
      const events=Array.isArray(raw.event_types)?raw.event_types.map(event=>event?.name):[];
      const missingEvents=required.filter(name=>!events.includes(name)&&!events.includes('*'));
      const checks={idMatches:raw.id===webhookId,https:url.protocol==='https:'&&!url.username&&!url.password,exactPath:url.pathname==='/api/paypal/webhook'&&!url.search&&!url.hash,eventSubscriptions:missingEvents.length===0};
      return Object.freeze({environment:'sandbox',oauthAuthenticated:true,checks,missingEvents,ready:Object.values(checks).every(Boolean),reachability:'not_tested',merchantIdentity:'requires_real_order_validation'});
    },
    async createOrder(input) {
      const e = expectedOrder(input); operationId(input.operationId);
      const raw = await api('/v2/checkout/orders','POST',{
        intent:'CAPTURE', purchase_units:[{
          reference_id:e.intentId, custom_id:e.intentId,
          amount:{ currency_code:'USD', value:usdValue(e.depositCents) }, payee:{merchant_id:e.merchantId},
        }],
      },input.operationId);
      try { return inspectOrder(raw,e); } catch { bad('provider_reconciliation_required'); }
    },
    async getOrder(input) {
      expectedOrder(input); const orderId = identifier(input.orderId);
      return inspectOrder(await api(`/v2/checkout/orders/${orderId}`,'GET'),input);
    },
    async captureOrder(input) {
      expectedOrder(input); const orderId = identifier(input.orderId); operationId(input.operationId);
      const raw = await api(`/v2/checkout/orders/${orderId}/capture`,'POST',{},input.operationId);
      try { return inspectOrder(raw,input); } catch { bad('provider_reconciliation_required'); }
    },
    async verifyWebhook({ rawBody, headers }) {
      identifier(webhookId);
      if (typeof rawBody !== 'string' || Buffer.byteLength(rawBody,'utf8') > 128_000 || !(headers instanceof Headers)) bad('invalid_webhook');
      let event; try { event = JSON.parse(rawBody); } catch { bad('invalid_webhook'); }
      if (!object(event) || typeof event.id !== 'string' || typeof event.event_type !== 'string' || !object(event.resource)) bad('invalid_webhook');
      identifier(event.id);
      const fields = Object.fromEntries(['auth-algo','cert-url','transmission-id','transmission-sig','transmission-time'].map(k => {
        const value = headers.get(`paypal-${k}`);
        if (!value || value.length > 4096 || /[\r\n]/.test(value)) bad('invalid_webhook');
        return [k.replaceAll('-','_'),value];
      }));
      let cert; try { cert = new URL(fields.cert_url); } catch { bad('invalid_webhook'); }
      if (cert.protocol !== 'https:' || !['api.paypal.com','api.sandbox.paypal.com','api-m.paypal.com','api-m.sandbox.paypal.com'].includes(cert.hostname) || cert.port || cert.username || cert.password || cert.search || cert.hash || !/^\/v1\/notifications\/certs\/[A-Za-z0-9-]+$/.test(cert.pathname)) bad('invalid_webhook');
      // Never fetch a certificate URL from the inbound request. Post verification to pinned PayPal.
      const result = await api('/v1/notifications/verify-webhook-signature','POST',{
        ...fields, webhook_id:webhookId, webhook_event:event,
      });
      if (result.verification_status !== 'SUCCESS') bad('invalid_webhook_signature');
      return Object.freeze({ environment:'sandbox', eventId:event.id, eventType:event.event_type, payloadHash:sha256(rawBody) });
    },
  });
}
