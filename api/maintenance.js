// api/maintenance.js
// Sistem maintenance + mode admin view (Cloudflare Workers)

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
  const key1 = url.searchParams.get('key1');
  const key2 = url.searchParams.get('key2');
  const adminView = url.searchParams.get('adminView');

  // ==========================================
  // MODE ADMIN VIEW
  // ==========================================
  if (adminView === '1') {
    if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
      return new Response(JSON.stringify({ error: 'Forbidden', isAdmin: false }), { status: 403, headers: cors });
    }
    return new Response(JSON.stringify({
      maintenance: false, // paksa false
      isAdmin: true
    }), { status: 200, headers: cors });
  }

  // ==========================================
  // CEK STATUS (publik)
  // ==========================================
  if (!action) {
    const maintenance = (await redis.get('maintenance')) === 'on';
    return new Response(JSON.stringify({ maintenance }), { status: 200, headers: cors });
  }

  // ==========================================
  // UBAH STATUS — wajib 2 kunci benar
  // ==========================================
  if (action === 'on' || action === 'off') {
    if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
      return new Response(JSON.stringify({
        error: 'Forbidden',
        message: 'Kunci tidak valid'
      }), { status: 403, headers: cors });
    }
    
    await redis.set('maintenance', action);
    
    return new Response(JSON.stringify({
      success: true,
      maintenance: action === 'on',
      message: action === 'on' ? 'Maintenance AKTIF di semua device' : 'Maintenance NONAKTIF'
    }), { status: 200, headers: cors });
  }

  return new Response(JSON.stringify({ error: 'Action tidak dikenal' }), { status: 400, headers: cors });
};