// api/users.js
// Log user terakhir yang masuk (Cloudflare Workers)

import { Redis } from '@upstash/redis/cloudflare';

export default async (request, env, ctx) => {
  // Setup CORS
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  // Inisialisasi Database
  let redis;
  try {
    redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Redis config error' }), { status: 500, headers: cors });
  }

  // Ambil parameter URL
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const device = url.searchParams.get('device');
  const key1 = url.searchParams.get('key1');
  const key2 = url.searchParams.get('key2');

  // ==========================================
  // MODE LOG (User Masuk)
  // ==========================================
  if (action === 'log') {
    try {
      const ua = request.headers.get('user-agent') || '';
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
              || request.headers.get('x-real-ip')
              || 'unknown';

      const rawLogs = await redis.lrange('user_logs', 0, -1) || [];
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
      await redis.del('user_logs');
      if (logs.length > 0) {
        await redis.lpush('user_logs', ...logs.map(l => JSON.stringify(l)));
        await redis.ltrim('user_logs', 0, 49);
      }

      return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: cors });
    }
  }

  // ==========================================
  // MODE ADMIN (Ambil Daftar User)
  // ==========================================
  if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
  }

  try {
    const rawLogs = await redis.lrange('user_logs', 0, 49) || [];
    const logs = [];
    for (const raw of rawLogs) {
      try { logs.push(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch (e) {}
    }

    const uniqueIPs = new Set(logs.map(l => l.ip));

    return new Response(JSON.stringify({
      total: logs.length,
      uniqueIPs: uniqueIPs.size,
      logs: logs
    }), { status: 200, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, logs: [] }), { status: 500, headers: cors });
  }
};