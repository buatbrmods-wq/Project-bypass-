// api/contact.js
// Simpan kontak admin (WA + Telegram) - Cloudflare Workers

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
  const waInput = url.searchParams.get('wa');
  const tgInput = url.searchParams.get('telegram');
  const key1 = url.searchParams.get('key1');
  const key2 = url.searchParams.get('key2');

  // ==========================================
  // CEK KONTAK (publik)
  // ==========================================
  if (!action) {
    const wa = await redis.get('contact_wa') || '';
    const telegram = await redis.get('contact_telegram') || '';
    return new Response(JSON.stringify({
      wa: wa,
      telegram: telegram,
      active: !!(wa || telegram)
    }), { status: 200, headers: cors });
  }

  // ==========================================
  // SET KONTAK (butuh 2 kunci)
  // ==========================================
  if (action === 'set') {
    if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
    }
    
    await redis.set('contact_wa', waInput || '');
    await redis.set('contact_telegram', tgInput || '');
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Kontak disimpan'
    }), { status: 200, headers: cors });
  }

  // ==========================================
  // HAPUS KONTAK
  // ==========================================
  if (action === 'off') {
    if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
    }
    
    await redis.set('contact_wa', '');
    await redis.set('contact_telegram', '');
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Kontak dihapus'
    }), { status: 200, headers: cors });
  }

  return new Response(JSON.stringify({ error: 'Action tidak dikenal' }), { status: 400, headers: cors });
};