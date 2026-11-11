// api/feedback.js
// Menyimpan dan membaca feedback dari user (Cloudflare Workers)

import { Redis } from '@upstash/redis/cloudflare';

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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  let redis;
  try {
    redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Redis config error' }), { status: 500, headers: cors });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const message = url.searchParams.get('message');
  const name = url.searchParams.get('name');
  const key1 = url.searchParams.get('key1');
  const key2 = url.searchParams.get('key2');
  const ip = request.headers.get('cf-connecting-ip') || 
             request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
             'unknown';

  // ==========================================
  // MODE KIRIM FEEDBACK (Publik)
  // ==========================================
  if (action === 'send') {
    if (!message) return new Response(JSON.stringify({ error: 'Pesan tidak boleh kosong' }), { status: 400, headers: cors });
    
    try {
      const newFeedback = {
        id: String(Date.now()),
        time: new Date().toISOString(),
        name: name || 'Anonim',
        message: message,
        ip: ip
      };

      await redis.lpush('user_feedback', JSON.stringify(newFeedback));
      await redis.ltrim('user_feedback', 0, 99);

      // ==========================================
      // NOTIFIKASI TELEGRAM UNTUK FEEDBACK BARU
      // ==========================================
      const ua = request.headers.get('user-agent') || 'Unknown';
      const timeNow = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      
      const msg = `📝 *FEEDBACK BARU MASUK*\n\n` +
                  `👤 *Nama:* ${name || 'Anonim'}\n` +
                  `💬 *Pesan:* "${message}"\n` +
                  `🌐 *IP:* ${ip}\n` +
                  `📱 *Device:* ${ua.substring(0, 50)}...\n` +
                  `⏱️ *Waktu:* ${timeNow}`;
      await sendTelegram(msg, env);

      return new Response(JSON.stringify({ success: true, message: 'Feedback terkirim' }), { status: 200, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
    }
  }

  // ==========================================
  // VALIDASI ADMIN UNTUK AKSI SELANJUTNYA
  // ==========================================
  if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
  }

  if (action === 'clear') {
    try {
      await redis.del('user_feedback');
      return new Response(JSON.stringify({ success: true, message: 'Semua feedback dihapus' }), { status: 200, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
    }
  }

  try {
    const rawData = await redis.lrange('user_feedback', 0, 99) || [];
    const feedbacks = [];
    for (const raw of rawData) {
      try { feedbacks.push(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch (e) {}
    }
    return new Response(JSON.stringify({ total: feedbacks.length, feedbacks }), { status: 200, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, feedbacks: [] }), { status: 500, headers: cors });
  }
};