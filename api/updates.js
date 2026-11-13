// api/updates.js
import { Redis } from '@upstash/redis/cloudflare';

export default async (request, env, ctx) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

  let redis;
  try {
    redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Redis config error' }), { status: 500, headers: cors });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const title = url.searchParams.get('title');
  const content = url.searchParams.get('content');
  const version = url.searchParams.get('version'); // <-- Tambahan
  const key1 = url.searchParams.get('key1');
  const key2 = url.searchParams.get('key2');

  // ==========================================
  // MODE AMBIL DATA (Publik)
  // ==========================================
  if (!action) {
    try {
      const raw = await redis.lrange('app_updates', 0, 19) || [];
      const updates = raw.map(r => typeof r === 'string' ? JSON.parse(r) : r);
      return new Response(JSON.stringify({ updates }), { status: 200, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ updates: [] }), { status: 200, headers: cors });
    }
  }

  // ==========================================
  // MODE TAMBAH UPDATE (Admin)
  // ==========================================
  if (action === 'add') {
    if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
    }
    if (!title || !content) {
      return new Response(JSON.stringify({ error: 'Judul dan isi wajib diisi' }), { status: 400, headers: cors });
    }

    try {
      const newUpdate = {
        id: String(Date.now()),
        time: new Date().toISOString(),
        version: version || 'v1.0.0', // <-- Tambahan
        title: title,
        content: content
      };

      await redis.lpush('app_updates', JSON.stringify(newUpdate));
      await redis.ltrim('app_updates', 0, 19);

      await redis.set('update_notif_flag', String(Date.now()));

      return new Response(JSON.stringify({ success: true, message: 'Update berhasil ditambahkan' }), { status: 200, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
    }
  }

  // ==========================================
  // MODE HAPUS SEMUA UPDATE (Admin)
  // ==========================================
  if (action === 'clear') {
    if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
    }
    try {
      await redis.del('app_updates');
      return new Response(JSON.stringify({ success: true, message: 'Semua update dihapus' }), { status: 200, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
    }
  }

  return new Response(JSON.stringify({ error: 'Action tidak dikenal' }), { status: 400, headers: cors });
};