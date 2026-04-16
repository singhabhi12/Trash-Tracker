const { Redis } = require('@upstash/redis');
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const twilio = require('twilio');

const BIN_LABELS = {
  restmuell: '🗑️ General Waste',
  bio:       '🟤 Organic Waste',
  gelb:      '🟡 Yellow Bag / Bin',
  papier:    '📄 Paper & Card',
};

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (process.env.CRON_SECRET) {
    if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const tomorrowStr = getTomorrow();

  const users = (await redis.smembers('registered_users')) || [];
  let sent = 0, skipped = 0, errors = 0;

  for (const phone of users) {
    const user = await redis.get(`user:${phone}`);
    if (!user) continue;

    const bins = (user.dates || []).filter(d => d.date === tomorrowStr);
    if (!bins.length) { skipped++; continue; }

    const lines = bins.map(b => BIN_LABELS[b.type] || b.type).join('\n');
    const body = [
      '🗑️ *Bin Reminder — Tomorrow!*',
      '',
      `Collection tomorrow (${tomorrowStr}):`,
      '',
      lines,
      '',
      '📅 Please put the bins out tonight!',
    ].join('\n');

    try {
      await client.messages.create({ from, to: `whatsapp:${phone}`, body });
      sent++;
    } catch (err) {
      console.error(`Failed → ${phone}:`, err.message);
      errors++;
    }
  }

  return res.status(200).json({ tomorrowStr, sent, skipped, errors });
};
