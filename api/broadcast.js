// api/broadcast.js
// Notifikasi broadcast ke semua user (Cloudflare Workers)

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

  // Ambil parameter dari URL
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const message = url.searchParams.get('message');
  const type = url.searchParams.get('type');
  const key1 = url.searchParams.get('key1');
  const key2 = url.searchParams.get('key2');

  // ==========================================
  // CEK BROADCAST (publik)
  // ==========================================
  if (!action) {
    const msg = await redis.get('broadcast_message') || '';
    const bType = await redis.get('broadcast_type') || 'info';
    const active = await redis.get('broadcast_active') || 'off';

    return new Response(JSON.stringify({
      active: active === 'on',
      message: msg,
      type: bType
    }), { status: 200, headers: cors });
  }

  // ==========================================
  // SET BROADCAST (butuh 2 kunci)
  // ==========================================
  if (action === 'set') {
    if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
    }

    await redis.set('broadcast_message', message || '');
    await redis.set('broadcast_type', type || 'info');
    await redis.set('broadcast_active', 'on');
    await redis.set('broadcast_updated_at', new Date().toISOString());

    return new Response(JSON.stringify({
      success: true,
      message: 'Broadcast terkirim ke semua user'
    }), { status: 200, headers: cors });
  }

  // ==========================================
  // MATIKAN BROADCAST
  // ==========================================
  if (action === 'off') {
    if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
    }
    
    await redis.set('broadcast_active', 'off');
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Broadcast dimatikan'
    }), { status: 200, headers: cors });
  }

  return new Response(JSON.stringify({ error: 'Action tidak dikenal' }), { status: 400, headers: cors });
};