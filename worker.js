// worker.js - Cloudflare Workers Backend (13 API Sesuai Daftar)
import { Redis } from '@upstash/redis/cloudflare';

const ENDPOINTS = {
  adlink: 'adlink', sfl: 'sfl', delta: 'izen', linkvertise: 'linkvertise',
  move2link: 'move2link', bicolink: 'bicolink', sub2unlock: 'sub2unlock',
  sub4unlock: 'sub4unlock', universal: 'universal'
};

const SERVICES = ['adlink', 'sfl', 'delta', 'linkvertise', 'move2link', 'bicolink', 'sub2unlock', 'sub4unlock', 'universal'];

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
    const key1 = url.searchParams.get('key1');
    const key2 = url.searchParams.get('key2');
    const isAdmin = (key1 === env.ADMIN_KEY_1 && key2 === env.ADMIN_KEY_2);

    // 1. API BYPASS
    if (path === '/api/bypass') {
      const type = url.searchParams.get('type');
      const targetUrl = url.searchParams.get('url');
      if (!type || !targetUrl || !ENDPOINTS[type]) return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: cors });

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
      } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors }); }
    }

    // 2. API MAINTENANCE
    if (path === '/api/maintenance') {
      const action = url.searchParams.get('action');
      if (!action) return new Response(JSON.stringify({ maintenance: (await redis.get('maintenance')) === 'on' }), { headers: cors });
      if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      if (action === 'on' || action === 'off') {
        await redis.set('maintenance', action);
        return new Response(JSON.stringify({ success: true, maintenance: action === 'on' }), { headers: cors });
      }
    }

    // 3. API SERVICES
    if (path === '/api/services') {
      const action = url.searchParams.get('action');
      if (!action) {
        const result = {};
        for (const s of SERVICES) result[s] = { status: await redis.get(`service_${s}_status`) || 'on', reason: await redis.get(`service_${s}_reason`) || '' };
        return new Response(JSON.stringify({ services: result }), { headers: cors });
      }
      if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      if (action === 'set') {
        await redis.set(`service_${url.searchParams.get('service')}_status`, url.searchParams.get('status'));
        await redis.set(`service_${url.searchParams.get('service')}_reason`, url.searchParams.get('reason') || '');
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }
    }

    // 4. API BROADCAST
    if (path === '/api/broadcast') {
      const action = url.searchParams.get('action');
      if (!action) return new Response(JSON.stringify({ active: (await redis.get('broadcast_active')) === 'on', message: await redis.get('broadcast_message') || '', type: await redis.get('broadcast_type') || 'info' }), { headers: cors });
      if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
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

    // 5. API STATS
    if (path === '/api/stats') {
      if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      const today = new Date().toISOString().split('T')[0];
      const totalToday = parseInt(await redis.get(`stats_bypass_${today}`) || 0);
      const usersToday = parseInt(await redis.scard(`stats_users_${today}`) || 0);
      const totalAll = parseInt(await redis.get('stats_total_bypass') || 0);
      
      const byService = {};
      for (const s of SERVICES) byService[s] = parseInt(await redis.get(`stats_service_${s}_${today}`) || 0);
      
      return new Response(JSON.stringify({
        today: { total: totalToday, users: usersToday, byService: byService },
        allTime: { total: totalAll }
      }), { headers: cors });
    }

    // 6. API HEALTH
    if (path === '/api/health') {
      const auto = url.searchParams.get('auto');
      let upstashOk = false;
      try { await redis.get('health_check'); upstashOk = true; } catch (e) {}

      const results = {
        vercel: { status: 'online', message: 'API Cloudflare berjalan normal' },
        upstash: { status: upstashOk ? 'online' : 'offline' },
        theresav: { status: 'checking' }
      };

      try {
        const tRes = await fetch('https://api.theresav.eu/api/bypass/move2link?url=https://move2link.co/b4264b4', { headers: { 'x-apikey': env.THERESAV_API_KEY } });
        const tData = await tRes.json();
        results.theresav.status = tData.status ? 'online' : 'offline';
      } catch (e) { results.theresav.status = 'offline'; }

      if (auto === '1') {
        const hasOffline = Object.values(results).some(r => r.status === 'offline');
        const allOnline = Object.values(results).every(r => r.status === 'online');
        const currentMaint = (await redis.get('maintenance')) === 'on';

        if (hasOffline && !currentMaint) {
          await redis.set('maintenance', 'on');
          await redis.set('auto_maintenance_active', 'on');
        } else if (allOnline && (await redis.get('auto_maintenance_active')) === 'on') {
          await redis.set('maintenance', 'off');
          await redis.set('auto_maintenance_active', 'off');
        }
        return new Response(JSON.stringify({ auto: true, results }), { headers: cors });
      }
      
      return new Response(JSON.stringify({ results }), { headers: cors });
    }

    // 7. API HEALTH-CHECK (Tambahan dari daftar Yang Mulia)
    if (path === '/api/health-check') {
      const baseUrl = 'https://' + (request.headers.get('host') || 'bypaslink-api.faridibnu050113.workers.dev');
      try {
        const response = await fetch(baseUrl + '/api/health?auto=1');
        const data = await response.json();
        return new Response(JSON.stringify({ success: true, timestamp: new Date().toISOString(), data }), { headers: cors });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: cors });
      }
    }

    // 8. API CONTACT
    if (path === '/api/contact') {
      const action = url.searchParams.get('action');
      if (!action) return new Response(JSON.stringify({ wa: await redis.get('contact_wa') || '', telegram: await redis.get('contact_telegram') || '' }), { headers: cors });
      if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      if (action === 'set') {
        await redis.set('contact_wa', url.searchParams.get('wa') || '');
        await redis.set('contact_telegram', url.searchParams.get('telegram') || '');
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }
      if (action === 'off') {
        await redis.set('contact_wa', ''); await redis.set('contact_telegram', '');
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }
    }

    // 9. API WELCOME
    if (path === '/api/welcome') {
      return new Response(JSON.stringify({
        active: true,
        message: "Selamat datang di BYPASS WEB.\nJangan lupa follow TikTok kami ya! 🎵\n\nSemoga harimu menyenangkan! 🔥",
        tiktok_url: "https://www.tiktok.com/@nuzz_rawrrr"
      }), { headers: cors });
    }

    // 10. API INFO
    if (path === '/api/info') {
      const action = url.searchParams.get('action');
      if (!action) return new Response(JSON.stringify({ title: await redis.get('info_title') || 'Tentang Aplikasi', content: await redis.get('info_content') || 'Bypass Web.', contact: await redis.get('info_contact') || '' }), { headers: cors });
      if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      if (action === 'set') {
        await redis.set('info_title', url.searchParams.get('title') || 'Tentang Aplikasi');
        await redis.set('info_content', url.searchParams.get('content') || '');
        await redis.set('info_contact', url.searchParams.get('contact') || '');
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }
    }

    // 11. API PANIC
    if (path === '/api/panic') {
      if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      const action = url.searchParams.get('action');
      if (action === 'on') {
        for (const s of SERVICES) { await redis.set(`service_${s}_status`, 'off'); await redis.set(`service_${s}_reason`, 'Server down sementara'); }
        await redis.set('maintenance', 'on');
        await redis.set('broadcast_message', '🚨 Server down sementara.');
        await redis.set('broadcast_active', 'on');
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      } else if (action === 'off') {
        for (const s of SERVICES) { await redis.set(`service_${s}_status`, 'on'); await redis.set(`service_${s}_reason`, ''); }
        await redis.set('maintenance', 'off');
        await redis.set('broadcast_active', 'off');
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }
    }

    // 12. API USERS
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
        if (logs.length > 0) { await redis.lpush('user_logs', ...logs.map(l => JSON.stringify(l))); await redis.ltrim('user_logs', 0, 49); }
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }
      if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      const rawLogs = await redis.lrange('user_logs', 0, 49) || [];
      return new Response(JSON.stringify({ total: rawLogs.length, logs: rawLogs.map(r => typeof r === 'string' ? JSON.parse(r) : r) }), { headers: cors });
    }

    // 13. API FEEDBACK
    if (path === '/api/feedback') {
      const action = url.searchParams.get('action');
      if (action === 'send') {
        const msg = url.searchParams.get('message');
        const name = url.searchParams.get('name') || 'Anonim';
        await redis.lpush('user_feedback', JSON.stringify({ id: String(Date.now()), time: new Date().toISOString(), name, message: msg, ip }));
        await redis.ltrim('user_feedback', 0, 99);
        return new Response(JSON.stringify({ success: true }), { headers: cors });
      }
      if (!isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
      const raw = await redis.lrange('user_feedback', 0, 99) || [];
      return new Response(JSON.stringify({ feedbacks: raw.map(r => typeof r === 'string' ? JSON.parse(r) : r) }), { headers: cors });
    }

    return new Response('API Not Found', { status: 404, headers: cors });
  }
};