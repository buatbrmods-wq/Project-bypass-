// api/bypass.js
// Bypass link + Notifikasi Telegram (Cloudflare Workers)

import { Redis } from '@upstash/redis/cloudflare';

const ENDPOINTS = {
  adlink: 'adlink',
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
      body: JSON.stringify({
        chat_id: tgChatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });
  } catch (err) {
    console.error('Gagal kirim Telegram:', err);
  }
}

export default async (request, env, ctx) => {
  // Setup CORS
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'x-apikey, Content-Type',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  // Ambil parameter URL
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const targetUrl = url.searchParams.get('url');

  if (!type || !targetUrl) {
    return new Response(JSON.stringify({ error: 'Parameter type dan url wajib diisi' }), { status: 400, headers: cors });
  }

  if (!ENDPOINTS[type]) {
    return new Response(JSON.stringify({ error: 'Unsupported type: ' + type }), { status: 400, headers: cors });
  }

  // Inisialisasi Database
  let redis;
  try {
    redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Redis config error' }), { status: 500, headers: cors });
  }

  const theresavUrl = `https://api.theresav.eu/api/bypass/${ENDPOINTS[type]}?url=${encodeURIComponent(targetUrl)}`;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

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

      if (dataJson && dataJson.status === true) {
        // --- SUKSES ---
        const today = new Date().toISOString().split('T')[0];
        await redis.incr(`stats_bypass_${today}`);
        await redis.incr(`stats_service_${type}_${today}`);
        await redis.incr(`stats_total_bypass`);
        await redis.incr(`stats_total_service_${type}`);
        if (ip !== 'unknown') await redis.sadd(`stats_users_${today}`, ip);

        // Notif Telegram Sukses
        const bypassedLink = dataJson.bypassed_url || (dataJson.bypassed_urls && dataJson.bypassed_urls[0]) || '-';
        const msg = `✅ *BYPASS BERHASIL*\n\n` +
                    `📌 *Service:* ${type.toUpperCase()}\n` +
                    `🔗 *Awal:* ${targetUrl.substring(0, 50)}...\n` +
                    `🎯 *Hasil:* ${bypassedLink}\n` +
                    `🌐 *IP:* ${ip}\n` +
                    `⏱️ *Waktu:* ${new Date().toLocaleString('id-ID')}`;
        await sendTelegram(msg, env);

      } else if (dataJson && dataJson.error) {
        // --- GAGAL DARI THERESAV ---
        const msg = `⚠️ *BYPASS GAGAL (THERESAV)*\n\n` +
                    `📌 *Service:* ${type.toUpperCase()}\n` +
                    `🔗 *Link:* ${targetUrl.substring(0, 50)}...\n` +
                    `❌ *Pesan:* ${dataJson.error}\n` +
                    `🌐 *IP:* ${ip}`;
        await sendTelegram(msg, env);
      }
    } catch (logErr) {
      console.error('Log error:', logErr);
    }

    return new Response(data, {
      status: response.status,
      headers: cors
    });

  } catch (err) {
    // --- GAGAL TOTAL (Server Crash) ---
    const msg = `🚨 *BYPASS GAGAL (ERROR SYSTEM)*\n\n` +
                `📌 *Service:* ${type.toUpperCase()}\n` +
                `🔗 *Link:* ${targetUrl.substring(0, 50)}...\n` +
                `❌ *Error:* ${err.message}\n` +
                `🌐 *IP:* ${ip}`;
    await sendTelegram(msg, env);

    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
};