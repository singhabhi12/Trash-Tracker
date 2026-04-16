const { Redis } = require('@upstash/redis');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ error: 'Database not configured.' });
  }

  const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  const phones = (await redis.smembers('registered_users')) || [];
  const today = new Date().toISOString().split('T')[0];

  const contacts = await Promise.all(phones.map(async phone => {
    const user = await redis.get(`user:${phone}`);
    const upcoming = (user?.dates || [])
      .filter(d => d.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    const next = upcoming[0] || null;
    return {
      phone,
      masked: phone.slice(0, 3) + '****' + phone.slice(-4),
      nextDate: next?.date || null,
      nextType: next?.type || null,
    };
  }));

  return res.status(200).json({ contacts });
};
