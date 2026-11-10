// worker.js - Cloudflare Workers Backend (All-in-One)
import { Redis } from '@upstash/redis/cloudflare';

const ENDPOINTS = {
  adlink: 'adlink', sfl: 'sfl', delta: 'izen', linkvertise: 'linkvertise',
  move2link: 'move2link', bicolink: 'bicolink', sub2unlock: 'sub2unlock',
  sub4unlock: 'sub4unlock', universal: 'universal'
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-apikey',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    let redis;
    try {
      redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Redis config error' }), { status: 500, headers: cors });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

    // ==========================================
    // 1. API BYPASS
    // ==========================================
    if (path === '/api/bypass') {
      const type = url.searchParams.get('type');
      const targetUrl = url.searchParams.get('url');

      if (!type || !targetUrl || !ENDPOINTS[type]) {
        return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: cors });
      }

      const theresavUrl = `https://api.theresav.eu/api/bypass/${ENDPOINTS[type]}?url=${encodeURIComponent(targetUrl)}`;

      try {
        const response = await fetch(theresavUrl, { headers: { 'x-apikey': env.THERESAV_API_KEY } });
        const data = await response.text();
        const dataJson = JSON.parse(data);

        if (dataJson && dataJson.status === true) {
          const today = new Date().toISOString().split('T')[0];
          await redis.incr(`stats_bypass_${today}`);
          await redis.incr(`stats_service_${type}_${today}`);
          await redis.incr(`stats_total_bypass`);
          await redis.incr(`stats_total_service_${type}`);
          if (ip !== 'unknown') await redis.sadd(`stats_users_${today}`, ip);

          // Notif Telegram
          if (env.TELEGRAM_TOKEN && env.TELEGRAM_CHAT_ID) {
            const bypassedLink = dataJson.bypassed_url || (dataJson.bypassed_urls && dataJson.bypassed_urls[0]) || '-';
            const msg = `✅ *BYPASS BERHASIL*\n\n📌 Service: ${type}\n🎯 Hasil: ${bypassedLink}\n🌐 IP: ${ip}`;
            ctx.waitUntil(fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' })
            }));
          }
        }
        return new Response(data, { status: response.status, headers: { ...cors, 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
      }
    }

    // ==========================================
    // 2. API MAINTENANCE
    // ==========================================
    if (path === '/api/maintenance') {
      const action = url.searchParams.get('action');
      const key1 = url.searchParams.get('key1');
      const key2 = url.searchParams.get('key2');

      if (!action) {
        const maintenance = (await redis.get('maintenance')) === 'on';
        return new Response(JSON.stringify({ maintenance }), { headers: cors });
      }

      if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      }

      if (action === 'on' || action === 'off') {
        await redis.set('maintenance', action);
        return new Response(JSON.stringify({ success: true, maintenance: action === 'on' }), { headers: cors });
      }
    }

    // ==========================================
    // 3. API SERVICES (ON/OFF)
    // ==========================================
    if (path === '/api/services') {
      const action = url.searchParams.get('action');
      const key1 = url.searchParams.get('key1');
      const key2 = url.searchParams.get('key2');
      const VALID = Object.keys(ENDPOINTS);

      if (!action) {
        const result = {};
        for (const s of VALID) {
          result[s] = {
            status: await redis.get(`service_${s}_status`) || 'on',
            reason: await redis.get(`service_${s}_reason`) || ''
          };
        }
        return new Response(JSON.stringify({ services: result }), { headers: cors });
      }

      if (action === 'set') {
        if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
        }
        const service = url.searchParams.get('service');
        const status = url.searchParams.get('status');
        const reason = url.searchParams.get('reason') || '';
        
        await redis.set(`service_${service}_status`, status);
        await redis.set(`service_${service}_reason`, reason);
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }
    }

    // ==========================================
    // 4. API BROADCAST
    // ==========================================
    if (path === '/api/broadcast') {
      const action = url.searchParams.get('action');
      
      if (!action) {
        return new Response(JSON.stringify({
          active: (await redis.get('broadcast_active')) === 'on',
          message: await redis.get('broadcast_message') || '',
          type: await redis.get('broadcast_type') || 'info'
        }), { headers: cors });
      }

      const key1 = url.searchParams.get('key1');
      const key2 = url.searchParams.get('key2');
      if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      }

      if (action === 'set') {
        await redis.set('broadcast_message', url.searchParams.get('message') || '');
        await redis.set('broadcast_type', url.searchParams.get('type') || 'info');
        await redis.set('broadcast_active', 'on');
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }
      if (action === 'off') {
        await redis.set('broadcast_active', 'off');
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }
    }

    // ==========================================
    // 5. API STATS
    // ==========================================
    if (path === '/api/stats') {
      const key1 = url.searchParams.get('key1');
      const key2 = url.searchParams.get('key2');
      if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      }
      const today = new Date().toISOString().split('T')[0];
      const todayTotal = await redis.get(`stats_bypass_${today}`) || 0;
      const todayUsers = await redis.scard(`stats_users_${today}`) || 0;
      const totalAll = await redis.get('stats_total_bypass') || 0;
      
      return new Response(JSON.stringify({
        today: { total: parseInt(todayTotal), users: parseInt(todayUsers) },
        allTime: { total: parseInt(totalAll) }
      }), { headers: cors });
    }

    // ==========================================
    // 6. API CONTACT
    // ==========================================
    if (path === '/api/contact') {
      const action = url.searchParams.get('action');
      if (!action) {
        return new Response(JSON.stringify({
          wa: await redis.get('contact_wa') || '',
          telegram: await redis.get('contact_telegram') || ''
        }), { headers: cors });
      }
      const key1 = url.searchParams.get('key1');
      const key2 = url.searchParams.get('key2');
      if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      }
      if (action === 'set') {
        await redis.set('contact_wa', url.searchParams.get('wa') || '');
        await redis.set('contact_telegram', url.searchParams.get('telegram') || '');
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }
    }

    // ==========================================
    // 7. API WELCOME
    // ==========================================
    if (path === '/api/welcome') {
      return new Response(JSON.stringify({
        active: true,
        message: "Selamat datang di BYPASS WEB.\nJangan lupa follow TikTok kami ya! 🎵\n\nSemoga harimu menyenangkan! 🔥",
        tiktok_url: "https://www.tiktok.com/@nuzz_rawrrr"
      }), { headers: cors });
    }

    // ==========================================
    // 8. API INFO
    // ==========================================
    if (path === '/api/info') {
      const action = url.searchParams.get('action');
      if (!action) {
        return new Response(JSON.stringify({
          title: await redis.get('info_title') || 'Tentang Aplikasi',
          content: await redis.get('info_content') || 'Bypass Web.',
          contact: await redis.get('info_contact') || ''
        }), { headers: cors });
      }
      const key1 = url.searchParams.get('key1');
      const key2 = url.searchParams.get('key2');
      if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      }
      if (action === 'set') {
        await redis.set('info_title', url.searchParams.get('title') || 'Tentang Aplikasi');
        await redis.set('info_content', url.searchParams.get('content') || '');
        await redis.set('info_contact', url.searchParams.get('contact') || '');
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }
    }

    // ==========================================
    // 9. API USERS (LOG)
    // ==========================================
    if (path === '/api/users') {
      const action = url.searchParams.get('action');
      if (action === 'log') {
        const device = url.searchParams.get('device') || 'unknown';
        const ua = request.headers.get('user-agent') || '';
        
        const rawLogs = await redis.lrange('user_logs', 0, -1) || [];
        let logs = rawLogs.map(r => typeof r === 'string' ? JSON.parse(r) : r);
        const existingIdx = logs.findIndex(l => l.ip === ip);

        if (existingIdx !== -1) {
          const existingUser = logs.splice(existingIdx, 1)[0];
          existingUser.time = new Date().toISOString();
          existingUser.device = device;
          existingUser.visits = (existingUser.visits || 1) + 1;
          logs.unshift(existingUser);
        } else {
          logs.unshift({ time: new Date().toISOString(), ip, device, ua: ua.substring(0, 200), visits: 1 });
        }

        logs = logs.slice(0, 50);
        await redis.del('user_logs');
        if (logs.length > 0) {
          await redis.lpush('user_logs', ...logs.map(l => JSON.stringify(l)));
          await redis.ltrim('user_logs', 0, 49);
        }
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }

      const key1 = url.searchParams.get('key1');
      const key2 = url.searchParams.get('key2');
      if (key1 !== env.ADMIN_KEY_1 || key2 !== env.ADMIN_KEY_2) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      }
      
      const rawLogs = await redis.lrange('user_logs', 0, 49) || [];
      const logs = rawLogs.map(r => typeof r === 'string' ? JSON.parse(r) : r);
      return new Response(JSON.stringify({ total: logs.length, logs }), { headers: cors });
    }

    return new Response('API Not Found', { status: 404, headers: cors });
  }
};
