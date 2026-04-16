const { kv } = require('@vercel/kv');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, dates, action } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Phone number required.' });

  const normalized = phone.replace(/[\s\-()]/g, '').replace(/^00/, '+');
  if (!/^\+\d{7,15}$/.test(normalized)) {
    return res.status(400).json({ error: 'Invalid number. Use international format, e.g. +49151234567' });
  }

  if (action === 'unregister') {
    await kv.del(`user:${normalized}`);
    await kv.srem('registered_users', normalized);
    return res.status(200).json({ success: true });
  }

  await kv.set(`user:${normalized}`, {
    phone: normalized,
    dates: dates || [],
    updatedAt: new Date().toISOString(),
  });
  await kv.sadd('registered_users', normalized);
  return res.status(200).json({ success: true });
};
