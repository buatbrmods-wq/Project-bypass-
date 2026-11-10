// api/welcome.js
// Pesan welcome + TikTok — edit langsung di sini (Cloudflare Workers)

export default async (request, env, ctx) => {
  // Setup CORS
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  // ==========================================
  // EDIT PESAN DI SINI
  // ==========================================
  const WELCOME_MESSAGE = `
Selamat datang di BYPASS WEB.
Jangan lupa follow TikTok kami ya! 🎵

Semoga harimu menyenangkan! 🔥`;

  const TIKTOK_URL = 'https://www.tiktok.com/@nuzz_rawrrr';
  const ACTIVE = true;  // ← ubah ke false kalau mau matikan
  // ==========================================

  return new Response(JSON.stringify({
    active: ACTIVE,
    message: WELCOME_MESSAGE,
    tiktok_url: TIKTOK_URL
  }), { status: 200, headers: cors });
};