// worker.js - Router Utama
import bypassHandler from './api/bypass.js';
import maintenanceHandler from './api/maintenance.js';
import servicesHandler from './api/services.js';
import broadcastHandler from './api/broadcast.js';
import statsHandler from './api/stats.js';
import healthHandler from './api/health.js';
import contactHandler from './api/contact.js';
import welcomeHandler from './api/welcome.js';
import infoHandler from './api/info.js';
import panicHandler from './api/panic.js';
import usersHandler from './api/users.js';
import feedbackHandler from './api/feedback.js';
import healthCheckHandler from './api/health-check.js';

const routes = {
  '/api/bypass': bypassHandler,
  '/api/maintenance': maintenanceHandler,
  '/api/services': servicesHandler,
  '/api/broadcast': broadcastHandler,
  '/api/stats': statsHandler,
  '/api/health': healthHandler,
  '/api/contact': contactHandler,
  '/api/welcome': welcomeHandler,
  '/api/info': infoHandler,
  '/api/panic': panicHandler,
  '/api/users': usersHandler,
  '/api/feedback': feedbackHandler,
  '/api/health-check': healthCheckHandler,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-apikey',
        }
      });
    }

    // Cari handler yang sesuai
    const handler = routes[path];
    if (handler) {
      // Panggil handler dari folder api/
      return handler(request, env, ctx);
    }

    // Jika rute tidak ditemukan
    return new Response(JSON.stringify({ error: 'API Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};