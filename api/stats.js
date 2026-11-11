// api/stats.js
// Baca statistik untuk dashboard (Cloudflare Workers)

import { Redis } from '@upstash/redis/cloudflare';

const SERVICES = ['adlink', 'sfl', 'delta', 'linkvertise', 'move2link', 'sub2unlock', 'sub4unlock', 'universal'];

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
  const key1 = url.searchParams.get('key1');
  const key2 = url.searchParams.get('key2');

  // Validasi Admin
  if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // ==========================================
  // TOTAL HARI INI
  // ==========================================
  const todayTotal = await redis.get(`stats_bypass_${today}`) || 0;
  const todayUsers = await redis.scard(`stats_users_${today}`) || 0;

  // Per service hari ini
  const todayByService = {};
  for (const s of SERVICES) {
    todayByService[s] = await redis.get(`stats_service_${s}_${today}`) || 0;
  }

  // ==========================================
  // 7 HARI TERAKHIR
  // ==========================================
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const count = await redis.get(`stats_bypass_${dateStr}`) || 0;
    const users = await redis.scard(`stats_users_${dateStr}`) || 0;
    last7.push({ date: dateStr, count: parseInt(count), users: parseInt(users) });
  }

  // ==========================================
  // TOTAL KESELURUHAN
  // ==========================================
  const totalAll = await redis.get('stats_total_bypass') || 0;

  const totalByService = {};
  for (const s of SERVICES) {
    totalByService[s] = await redis.get(`stats_total_service_${s}`) || 0;
  }

  // ==========================================
  // SERVICE TERPOPULER
  // ==========================================
  let topService = '-';
  let topCount = 0;
  for (const s of SERVICES) {
    const c = parseInt(totalByService[s]) || 0;
    if (c > topCount) { topCount = c; topService = s; }
  }

  return new Response(JSON.stringify({
    today: {
      total: parseInt(todayTotal),
      users: parseInt(todayUsers),
      byService: todayByService
    },
    last7Days: last7,
    allTime: {
      total: parseInt(totalAll),
      byService: totalByService,
      topService: topService,
      topCount: topCount
    }
  }), { status: 200, headers: cors });
};