// api/services.js
// ON/OFF per service + alasan (Cloudflare Workers)

import { Redis } from '@upstash/redis/cloudflare';

const VALID_SERVICES = ['adlink', 'sfl', 'delta', 'linkvertise', 'sub2unlock', 'sub4unlock', 'universal'];

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
  const service = url.searchParams.get('service');
  const status = url.searchParams.get('status');
  const reason = url.searchParams.get('reason');
  const key1 = url.searchParams.get('key1');
  const key2 = url.searchParams.get('key2');

  // ==========================================
  // CEK SEMUA SERVICE (publik)
  // ==========================================
  if (!action) {
    const result = {};
    for (const s of VALID_SERVICES) {
      const st = await redis.get(`service_${s}_status`) || 'on';
      const rs = await redis.get(`service_${s}_reason`) || '';
      result[s] = { status: st, reason: rs };
    }
    return new Response(JSON.stringify({ services: result }), { status: 200, headers: cors });
  }

  // ==========================================
  // MODE ADMIN VIEW
  // ==========================================
  if (action === 'adminView') {
    if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
      return new Response(JSON.stringify({ isAdmin: false }), { status: 403, headers: cors });
    }
    return new Response(JSON.stringify({ isAdmin: true }), { status: 200, headers: cors });
  }

  // ==========================================
  // UBAH STATUS SERVICE (butuh 2 kunci)
  // ==========================================
  if (action === 'set') {
    if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
    }
    if (!VALID_SERVICES.includes(service)) {
      return new Response(JSON.stringify({ error: 'Service tidak valid' }), { status: 400, headers: cors });
    }
    if (status !== 'on' && status !== 'off') {
      return new Response(JSON.stringify({ error: 'Status harus on atau off' }), { status: 400, headers: cors });
    }

    await redis.set(`service_${service}_status`, status);
    await redis.set(`service_${service}_reason`, reason || '');
    await redis.set(`service_${service}_updated_at`, new Date().toISOString());

    return new Response(JSON.stringify({
      success: true,
      service,
      status,
      reason: reason || '',
      message: `Service ${service} -> ${status.toUpperCase()}`
    }), { status: 200, headers: cors });
  }

  return new Response(JSON.stringify({ error: 'Action tidak dikenal' }), { status: 400, headers: cors });
};