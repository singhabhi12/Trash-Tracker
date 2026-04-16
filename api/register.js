const { Redis } = require('@upstash/redis');

module.exports = async function handler(req, res) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return res.status(500).json({ error: 'Database not configured. Connect Upstash in Vercel Storage tab.' });
  }
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
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
    await redis.del(`user:${normalized}`);
    await redis.srem('registered_users', normalized);
    return res.status(200).json({ success: true });
  }

  await redis.set(`user:${normalized}`, {
    phone: normalized,
    dates: dates || [],
    updatedAt: new Date().toISOString(),
  });
  await redis.sadd('registered_users', normalized);
  return res.status(200).json({ success: true });
};
