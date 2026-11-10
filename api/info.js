// api/info.js
// Menyimpan dan mengambil data info aplikasi (Cloudflare Workers)

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
  const title = url.searchParams.get('title');
  const content = url.searchParams.get('content');
  const contact = url.searchParams.get('contact');
  const key1 = url.searchParams.get('key1');
  const key2 = url.searchParams.get('key2');

  // ==========================================
  // 1. MODE AMBIL DATA (Untuk Admin Panel & Web Utama)
  // ==========================================
  if (!action) {
    try {
      const infoTitle = await redis.get('info_title') || 'Tentang Aplikasi';
      const infoContent = await redis.get('info_content') || 'Bypass Web — Bypass Generator Fast & Secure.';
      const infoContact = await redis.get('info_contact') || '';
      
      return new Response(JSON.stringify({ 
        title: infoTitle, 
        content: infoContent,
        contact: infoContact
      }), { status: 200, headers: cors });
    } catch (err) {
      return new Response(JSON.stringify({ 
        title: 'Tentang Aplikasi', 
        content: 'Bypass Web.',
        contact: ''
      }), { status: 200, headers: cors });
    }
  }

  // ==========================================
  // 2. MODE SIMPAN DATA (Butuh Kunci Admin)
  // ==========================================
  if (action === 'set') {
    if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
    }

    try {
      await redis.set('info_title', title || 'Tentang Aplikasi');
      await redis.set('info_content', content || '');
      await redis.set('info_contact', contact || '');

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Info aplikasi berhasil disimpan' 
      }), { status: 200, headers: cors });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
    }
  }

  return new Response(JSON.stringify({ error: 'Action tidak dikenal' }), { status: 400, headers: cors });
};