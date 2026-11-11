// api/bypass.js
// Bypass link + Notifikasi Telegram (Cloudflare Workers)

import { Redis } from '@upstash/redis/cloudflare';

const ENDPOINTS = {
  adlink: 'adlinksumo',
  sfl: 'sfl',
  delta: 'izen',
  linkvertise: 'linkvertise',
  move2link: 'move2link',
  bicolink: 'bicolink',
  sub2unlock: 'sub2unlock',
  sub4unlock: 'sub4unlock',
  universal: 'universal'
};

// ==========================================
// FUNGSI KIRIM PESAN TELEGRAM
// ==========================================
async function sendTelegram(text, env) {
  const tgToken = env.TELEGRAM_TOKEN;
  const tgChatId = env.TELEGRAM_CHAT_ID;
  if (!tgToken || !tgChatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: tgChatId, text: text, parse_mode: 'Markdown' })
    });
  } catch (err) {}
}

export default async (request, env, ctx) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'x-apikey, Content-Type',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const targetUrl = url.searchParams.get('url');

  if (!type || !targetUrl || !ENDPOINTS[type]) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: cors });
  }

  let redis;
  try {
    redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Redis config error' }), { status: 500, headers: cors });
  }

  // ==========================================
  // PERBAIKAN IP: Pakai cf-connecting-ip
  // ==========================================
  const ip = request.headers.get('cf-connecting-ip') || 
             request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
             'unknown';

  const theresavUrl = `https://api.theresav.eu/api/bypass/${ENDPOINTS[type]}?url=${encodeURIComponent(targetUrl)}`;

  try {
    const response = await fetch(theresavUrl, {
      method: 'GET',
      headers: { 'x-apikey': env.THERESAV_API_KEY }
    });

    const data = await response.text();

    // ==========================================
    // CATAT STATISTIK & NOTIFIKASI TELEGRAM
    // ==========================================
    try {
      const dataJson = JSON.parse(data);
      
      // Perbaikan: Anggap sukses jika ada status:true ATAU ada link hasilnya
      const isSuccess = (dataJson && dataJson.status === true) || 
                        (dataJson && dataJson.bypassed_url) || 
                        (dataJson && dataJson.bypassed_urls) ||
                        (dataJson && dataJson.url) ||
                        (dataJson && dataJson.result);
      
      if (isSuccess) {
        const today = new Date().toISOString().split('T')[0];
        await redis.incr(`stats_bypass_${today}`);
        await redis.incr(`stats_service_${type}_${today}`);
        await redis.incr(`stats_total_bypass`);
        await redis.incr(`stats_total_service_${type}`);
        
        // Simpan IP User
        if (ip !== 'unknown') await redis.sadd(`stats_users_${today}`, ip);

        // Notif Telegram
        const bypassedLink = dataJson.bypassed_url || (dataJson.bypassed_urls && dataJson.bypassed_urls[0]) || dataJson.url || dataJson.result || '-';
        const msg = `✅ *BYPASS BERHASIL*\n\n📌 *Service:* ${type.toUpperCase()}\n🎯 *Hasil:* ${bypassedLink}\n🌐 *IP:* ${ip}`;
        await sendTelegram(msg, env);

      } else if (dataJson && dataJson.error) {
        // Notif Gagal
        const msg = `⚠️ *BYPASS GAGAL (THERESAV)*\n\n📌 *Service:* ${type.toUpperCase()}\n❌ *Pesan:* ${dataJson.error}\n🌐 *IP:* ${ip}`;
        await sendTelegram(msg, env);
      }
    } catch (logErr) {
      console.error('Log error:', logErr);
    }

    return new Response(data, { status: response.status, headers: cors });

  } catch (err) {
    const msg = `🚨 *BYPASS GAGAL (ERROR SYSTEM)*\n\n📌 *Service:* ${type.toUpperCase()}\n❌ *Error:* ${err.message}\n🌐 *IP:* ${ip}`;
    await sendTelegram(msg, env);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
};