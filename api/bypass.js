import { kv } from '@vercel/kv';

const ADMIN_KEY_1 = process.env.ADMIN_KEY_1;
const ADMIN_KEY_2 = process.env.ADMIN_KEY_2;

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
async function sendTelegram(text) {
  const tgToken = process.env.TELEGRAM_TOKEN;
  const tgChatId = process.env.TELEGRAM_CHAT_ID;
  
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-apikey, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { type, url } = req.query;

  if (!type || !url) {
    return res.status(400).json({ error: 'Parameter type dan url wajib diisi' });
  }

  if (!ENDPOINTS[type]) {
    return res.status(400).json({ error: 'Unsupported type: ' + type });
  }

  const target = `https://api.theresav.eu/api/bypass/${ENDPOINTS[type]}?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: process.env.THERESAV_API_KEY
    });

    const data = await response.text();
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

    // ==========================================
    // CATAT STATISTIK & NOTIFIKASI TELEGRAM
    // ==========================================
    try {
      const dataJson = JSON.parse(data);
      
      if (dataJson && dataJson.status === true) {
        // --- SUKSES ---
        const today = new Date().toISOString().split('T')[0];
        await kv.incr(`stats_bypass_${today}`);
        await kv.incr(`stats_service_${type}_${today}`);
        await kv.incr(`stats_total_bypass`);
        await kv.incr(`stats_total_service_${type}`);
        if (ip !== 'unknown') await kv.sadd(`stats_users_${today}`, ip);

        // Notif Telegram Sukses
        const bypassedLink = dataJson.bypassed_url || (dataJson.bypassed_urls && dataJson.bypassed_urls[0]) || '-';
        const msg = `✅ *BYPASS BERHASIL*\n\n` +
                    `📌 *Service:* ${type.toUpperCase()}\n` +
                    `🔗 *Awal:* ${url.substring(0, 50)}...\n` +
                    `🎯 *Hasil:* ${bypassedLink}\n` +
                    `🌐 *IP:* ${ip}\n` +
                    `⏱️ *Waktu:* ${new Date().toLocaleString('id-ID')}`;
        await sendTelegram(msg);

      } else if (dataJson && dataJson.error) {
        // --- GAGAL DARI THERESAV ---
        const msg = `⚠️ *BYPASS GAGAL (THERESAV)*\n\n` +
                    `📌 *Service:* ${type.toUpperCase()}\n` +
                    `🔗 *Link:* ${url.substring(0, 50)}...\n` +
                    `❌ *Pesan:* ${dataJson.error}\n` +
                    `🌐 *IP:* ${ip}`;
        await sendTelegram(msg);
      }
    } catch (logErr) {
      console.error('Log error:', logErr);
    }

    return res.status(response.status)
      .setHeader('Content-Type', 'application/json')
      .send(data);
      
  } catch (err) {
    // --- GAGAL TOTAL (Server Vercel Crash) ---
    const msg = `🚨 *BYPASS GAGAL (ERROR SYSTEM)*\n\n` +
                `📌 *Service:* ${type.toUpperCase()}\n` +
                `🔗 *Link:* ${url.substring(0, 50)}...\n` +
                `❌ *Error:* ${err.message}\n` +
                `🌐 *IP:* ${ip}`;
    await sendTelegram(msg);

    return res.status(500).json({ error: err.message });
  }
}