// api/health.js
// Health check + auto-maintenance — HEMAT KV (Cloudflare Workers)

import { Redis } from '@upstash/redis/cloudflare';

// ==========================================
// CEK SEMUA SERVER
// ==========================================
async function cekSemuaServer(redis, env) {
  const results = {
    vercel: { status: 'online', time: 1, message: 'API Cloudflare berjalan normal' },
    upstash: { status: 'checking', time: 0, message: '' },
    theresav: { status: 'checking', time: 0, message: '' }
  };

  // 1. Cek Upstash — pakai GET saja (hemat)
  const kvStart = Date.now();
  try {
    const val = await redis.get('health_heartbeat');
    results.upstash.status = 'online';
    results.upstash.time = Date.now() - kvStart;
    results.upstash.message = 'Upstash KV berjalan normal';
  } catch (err) {
    results.upstash.status = 'offline';
    results.upstash.time = Date.now() - kvStart;
    results.upstash.message = 'Error: ' + err.message;
  }

  // 2. Cek Theresav
  const tStart = Date.now();
  try {
    const response = await fetch('https://api.theresav.eu/api/bypass/move2link?url=https://move2link.co/b4264b4', {
      method: 'GET',
      headers: { 'x-apikey': env.THERESAV_API_KEY }
    });
    const elapsed = Date.now() - tStart;

    if (response.ok) {
      const data = await response.json();
      if (data.status === true) {
        results.theresav.status = 'online';
        results.theresav.message = 'Theresav API berjalan normal';
      } else {
        results.theresav.status = 'offline';
        results.theresav.message = 'Theresav respons tidak valid';
      }
    } else {
      results.theresav.status = 'offline';
      results.theresav.message = 'Theresav HTTP ' + response.status;
    }
    results.theresav.time = elapsed;
  } catch (err) {
    results.theresav.status = 'offline';
    results.theresav.time = Date.now() - tStart;
    results.theresav.message = 'Error: ' + err.message;
  }

  return results;
}

// ==========================================
// AUTO-MAINTENANCE — HEMAT KV
// ==========================================
async function autoMaintenanceCheck(redis, env) {
  const results = await cekSemuaServer(redis, env);

  const adaOffline = Object.values(results).some(s => s.status === 'offline');
  const semuaNormal = Object.values(results).every(s => s.status === 'online');

  // Baca status terakhir (1 perintah)
  let state = {};
  try {
    state = await redis.get('health_state') || {};
  } catch (e) {
    state = {};
  }

  const maintenanceSekarang = state.maintenance === true;
  const autoActive = state.auto_active === true;

  let aksi = 'tidak ada';
  let needSave = false;

  // Kalau ada server offline & maintenance belum ON
  if (adaOffline && !maintenanceSekarang) {
    await redis.set('maintenance', 'on');
    await redis.set('auto_maintenance_active', 'on');
    await redis.set('broadcast_message', '⚠️ Server bermasalah. Maintenance otomatis aktif.');
    await redis.set('broadcast_type', 'warning');
    await redis.set('broadcast_active', 'on');
    aksi = 'maintenance ON (auto)';
    state.maintenance = true;
    state.auto_active = true;
    needSave = true;
  }
  // Kalau semua normal & auto-maintenance aktif
  else if (semuaNormal && autoActive) {
    await redis.set('maintenance', 'off');
    await redis.set('auto_maintenance_active', 'off');
    await redis.set('broadcast_active', 'off');
    aksi = 'maintenance OFF (auto)';
    state.maintenance = false;
    state.auto_active = false;
    needSave = true;
  }

  // Simpan state — 1 perintah (hanya kalau berubah)
  if (needSave) {
    state.updated_at = new Date().toISOString();
    await redis.set('health_state', state);
  }

  return { results, aksi };
}

// ==========================================
// HANDLER
// ==========================================
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
  const key1 = url.searchParams.get('key1');
  const key2 = url.searchParams.get('key2');
  const auto = url.searchParams.get('auto');

  // ==========================================
  // MODE AUTO (dipanggil cron-job.org)
  // ==========================================
  if (auto === '1') {
    try {
      const { results, aksi } = await autoMaintenanceCheck(redis, env);
      return new Response(JSON.stringify({
        timestamp: new Date().toISOString(),
        auto: true,
        aksi: aksi,
        results: results
      }), { status: 200, headers: cors });
    } catch (err) {
      return new Response(JSON.stringify({ auto: true, error: err.message }), { status: 500, headers: cors });
    }
  }

  // ==========================================
  // MODE MANUAL (dari admin panel)
  // ==========================================
  if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
  }

  const results = await cekSemuaServer(redis, env);
  return new Response(JSON.stringify({
    timestamp: new Date().toISOString(),
    auto: false,
    results: results
  }), { status: 200, headers: cors });
};