const { Redis } = require('@upstash/redis');
const twilio = require('twilio');

const BIN_LABELS = {
  restmuell: '🗑️ General Waste',
  bio:       '🟤 Organic Waste',
  gelb:      '🟡 Yellow Bag / Bin',
  papier:    '📄 Paper & Card',
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { phone } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Phone required.' });

  const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  const user = await redis.get(`user:${phone}`);
  if (!user) return res.status(404).json({ error: 'Contact not registered.' });

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const upcoming = (user.dates || [])
    .filter(d => d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!upcoming.length) {
    return res.status(200).json({ sent: false, message: 'No upcoming collections for this contact.' });
  }

  const nextDate = upcoming[0].date;
  const bins = upcoming.filter(d => d.date === nextDate);
  const lines = bins.map(b => BIN_LABELS[b.type] || b.type).join('\n');

  const dateLabel = nextDate === today
    ? 'today'
    : nextDate === tomorrowStr
    ? 'tomorrow'
    : `on ${nextDate}`;

  const body = [
    '🗑️ *Bin Collection Reminder!*',
    '',
    `Collection is ${dateLabel}:`,
    '',
    lines,
    '',
    '📅 Please put the bins out!',
  ].join('\n');

  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  try {
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${phone}`,
      body,
    });
    return res.status(200).json({ sent: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
