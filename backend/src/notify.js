const nodemailer = require("nodemailer");

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
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT), 
    secure: String(SMTP_SECURE || "false").toLowerCase() === "true",
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
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

