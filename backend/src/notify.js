const nodemailer = require("nodemailer");
const crypto = require('crypto')

function createMailerFromEnv() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    ALERTS_FROM,
    ALERTS_TO,
  } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !ALERTS_TO || !ALERTS_FROM) return null;
  const secure = String(SMTP_SECURE || "false").toLowerCase() === "true"
  const requireTLS = String(process.env.SMTP_REQUIRE_TLS || '').toLowerCase() === 'true'
  const ignoreTLS = String(process.env.SMTP_IGNORE_TLS || '0') === '1'
  const rejectUnauthorized = String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || '1') !== '0'
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure,
    requireTLS,
    ignoreTLS,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    tls: { rejectUnauthorized },
  });
  return {
    async sendAlertEmail({ deviceId, metricKey, ts, value, level }) {
      const subject = `[IoT Alert] ${level.toUpperCase()} – ${deviceId}/${metricKey}`;
      const text = `Alert level: ${level}\nDevice: ${deviceId}\nMetric: ${metricKey}\nValue: ${value}\nTime: ${new Date(ts).toISOString()}`;
      await transporter.sendMail({ from: ALERTS_FROM, to: ALERTS_TO, subject, text });
    },
  };
}

module.exports = { createMailerFromEnv };

// -------- Slack/Webhook routing --------
async function httpPost(url, body, headers = {}) {
  const f = (typeof fetch === 'function') ? fetch : (await import('node-fetch')).default
  const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text().catch(()=> '')
}

function mask(s, show = 6) {
  if (!s) return ''
  const str = String(s)
  if (str.length <= show) return '*'.repeat(Math.max(0,str.length-1)) + str.slice(-1)
  return str.slice(0, show) + '…'
}

function createRoutersFromEnv() {
  const state = {
    routeSlack: String(process.env.ROUTE_SLACK||'0') === '1',
    routeWebhook: String(process.env.ROUTE_WEBHOOK||'0') === '1',
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    slackChannel: process.env.SLACK_CHANNEL || '',
    webhookUrl: process.env.WEBHOOK_URL || '',
  }
  return {
    get() {
      return { ...state, slackWebhookUrlMasked: mask(state.slackWebhookUrl), webhookUrlMasked: mask(state.webhookUrl) }
    },
    update(patch={}) {
      for (const k of Object.keys(patch)) if (k in state) state[k] = patch[k]
      return this.get()
    },
    async sendAlert({ deviceId, metricKey, ts, value, level }) {
      const payload = { deviceId, metricKey, ts, value, level }
      // Slack Incoming Webhook
      if (state.routeSlack && state.slackWebhookUrl) {
        try {
          const text = `*IoT Alert* ${level.toUpperCase()} – ${deviceId}/${metricKey}\nValue: ${value}\nTime: ${new Date(ts).toISOString()}`
          await httpPost(state.slackWebhookUrl, { text, channel: state.slackChannel || undefined })
        } catch {}
      }
      // Generic Webhook
      if (state.routeWebhook && state.webhookUrl) {
        try { await httpPost(state.webhookUrl, { type: 'iot.alert', data: payload }) } catch {}
      }
    }
  }
}

module.exports.createRoutersFromEnv = createRoutersFromEnv

