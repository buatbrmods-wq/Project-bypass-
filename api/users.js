// api/users.js
import { kv } from '@vercel/kv';

const ADMIN_KEY_1 = process.env.ADMIN_KEY_1;
const ADMIN_KEY_2 = process.env.ADMIN_KEY_2;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { action, device, key1, key2 } = req.query;

  if (action === 'log') {
    try {
      const ua = req.headers['user-agent'] || '';
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
              || req.headers['x-real-ip']
              || 'unknown';

      const rawLogs = await kv.lrange('user_logs', 0, -1) || [];
      let logs = [];
      for (const raw of rawLogs) {
        try { logs.push(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch (e) {}
      }

      const existingIdx = logs.findIndex(l => l.ip === ip);

      if (existingIdx !== -1) {
        const existingUser = logs.splice(existingIdx, 1)[0];
        existingUser.time = new Date().toISOString();
        existingUser.device = device || 'unknown';
        existingUser.ua = ua.substring(0, 200);
        existingUser.visits = (existingUser.visits || 1) + 1;
        logs.unshift(existingUser);
      } else {
        logs.unshift({
          time: new Date().toISOString(),
          ip: ip,
          device: device || 'unknown',
          ua: ua.substring(0, 200),
          visits: 1
        });
      }

      logs = logs.slice(0, 50);
      await kv.del('user_logs');
      if (logs.length > 0) {
        await kv.lpush('user_logs', ...logs.map(l => JSON.stringify(l)));
        await kv.ltrim('user_logs', 0, 49);
      }

      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (key1 !== ADMIN_KEY_1 || key2 !== ADMIN_KEY_2) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const rawLogs = await kv.lrange('user_logs', 0, 49) || [];
    const logs = [];
    for (const raw of rawLogs) {
      try { logs.push(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch (e) {}
    }

    const uniqueIPs = new Set(logs.map(l => l.ip));

    return res.status(200).json({
      total: logs.length,
      uniqueIPs: uniqueIPs.size,
      logs: logs
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, logs: [] });
  }
}