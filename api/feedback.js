// api/feedback.js
// Menyimpan dan membaca feedback dari user

import { kv } from '@vercel/kv';

const ADMIN_KEY_1 = process.env.ADMIN_KEY_1;
const ADMIN_KEY_2 = process.env.ADMIN_KEY_2;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { action, message, name, key1, key2 } = req.query;

  // ==========================================
  // MODE KIRIM FEEDBACK (Publik)
  // ==========================================
  if (action === 'send') {
    if (!message) return res.status(400).json({ error: 'Pesan tidak boleh kosong' });
    
    try {
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
      const newFeedback = {
        id: String(Date.now()),
        time: new Date().toISOString(),
        name: name || 'Anonim',
        message: message,
        ip: ip
      };

      await kv.lpush('user_feedback', JSON.stringify(newFeedback));
      await kv.ltrim('user_feedback', 0, 99); // Simpan maks 100 feedback

      return res.status(200).json({ success: true, message: 'Feedback terkirim' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ==========================================
  // MODE LIHAT FEEDBACK (Admin)
  // ==========================================
  if (key1 !== ADMIN_KEY_1 || key2 !== ADMIN_KEY_2) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Mode Hapus
  if (action === 'clear') {
    try {
      await kv.del('user_feedback');
      return res.status(200).json({ success: true, message: 'Semua feedback dihapus' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Mode Ambil Data
  try {
    const rawData = await kv.lrange('user_feedback', 0, 99) || [];
    const feedbacks = [];
    for (const raw of rawData) {
      try { feedbacks.push(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch (e) {}
    }
    return res.status(200).json({ total: feedbacks.length, feedbacks });
  } catch (e) {
    return res.status(500).json({ error: e.message, feedbacks: [] });
  }
}
