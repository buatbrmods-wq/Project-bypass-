// api/health-check.js
// Endpoint untuk cron-job.org (Cloudflare Workers)

export default async (request, env, ctx) => {
  // Setup CORS
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  try {
    // Ambil host dari URL request (otomatis menyesuaikan domain Cloudflare Yang Mulia)
    const url = new URL(request.url);
    const baseUrl = url.origin;
    
    // Panggil endpoint health bawaan Yang Mulia
    const response = await fetch(baseUrl + '/api/health?auto=1');
    const data = await response.json();
    
    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      data: data
    }), { status: 200, headers: cors });
    
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: cors });
  }
};