// api/panic.js
// Tombol panik — matikan semua + maintenance ON + broadcast (Cloudflare Workers)

import { Redis } from '@upstash/redis/cloudflare';

const ALL_SERVICES = ['adlink', 'sfl', 'delta', 'linkvertise', 'move2link', 'sub2unlock', 'sub4unlock', 'universal'];

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
  const key1 = url.searchParams.get('key1');
  const key2 = url.searchParams.get('key2');

  // Validasi Admin
  if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
  }

  // ==========================================
  // PANIC ON — Matikan semua + maintenance ON
  // ==========================================
  if (action === 'on') {
    // 1. Matikan semua service
    for (const s of ALL_SERVICES) {
      await redis.set(`service_${s}_status`, 'off');
      await redis.set(`service_${s}_reason`, 'Server down sementara — coba lagi nanti');
    }

    // 2. Aktifkan maintenance
    await redis.set('maintenance', 'on');

    // 3. Broadcast otomatis
    await redis.set('broadcast_message', '🚨 Server down sementara. Mohon tunggu beberapa saat.');
    await redis.set('broadcast_type', 'danger');
    await redis.set('broadcast_active', 'on');

    return new Response(JSON.stringify({
      success: true,
      message: 'PANIC MODE AKTIF — semua service OFF, maintenance ON, broadcast terkirim'
    }), { status: 200, headers: cors });
  }

  // ==========================================
  // PANIC OFF — Nyalakan semua + maintenance OFF
  // ==========================================
  if (action === 'off') {
    for (const s of ALL_SERVICES) {
      await redis.set(`service_${s}_status`, 'on');
      await redis.set(`service_${s}_reason`, '');
    }

    await redis.set('maintenance', 'off');
    await redis.set('broadcast_active', 'off');

    return new Response(JSON.stringify({
      success: true,
      message: 'PANIC MODE NONAKTIF — semua service ON, maintenance OFF'
    }), { status: 200, headers: cors });
  }

  return new Response(JSON.stringify({ error: 'Action harus on atau off' }), { status: 400, headers: cors });
};