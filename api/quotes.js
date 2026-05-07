/**
 * api/quotes.js — Proxy Vercel pour Yahoo Finance (données différées ~15 min, gratuit)
 * 
 * Endpoint : GET /api/quotes?symbols=^GSPC,^IXIC,NVDA,...
 * Réponse  : { quotes: [{ symbol, price, change, changePercent }, ...] }
 * 
 * Déployé automatiquement par Vercel comme fonction serverless (Node.js).
 * Aucune clé API requise — Yahoo Finance est public (usage modéré).
 */

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // ── CORS : autorise votre domaine Vercel et l'ouverture locale ──
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = [
    'https://us-capital-alex.vercel.app',
    'http://localhost',
    'http://127.0.0.1',
  ];
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 's-maxage=60, stale-while-revalidate=120', // cache 1 min côté CDN
  };

  // Preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ── Récupération des symboles demandés ──
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get('symbols') || '';
  const symbols = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 20); // sécurité : max 20 symboles

  if (symbols.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Paramètre "symbols" manquant ou vide.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ── Appel Yahoo Finance v8 (API publique non officielle, différée ~15 min) ──
  const yahooUrl =
    `https://query1.finance.yahoo.com/v8/finance/spark?` +
    `symbols=${encodeURIComponent(symbols.join(','))}` +
    `&range=1d&interval=5m`;

  // On utilise aussi l'endpoint quoteSummary pour prix/variation instantanés
  const quoteUrl =
    `https://query1.finance.yahoo.com/v7/finance/quote?` +
    `symbols=${encodeURIComponent(symbols.join(','))}` +
    `&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName`;

  let yahooData;
  try {
    const res = await fetch(quoteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CapitalMeridian/1.0)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000), // timeout 8 s
    });

    if (!res.ok) {
      throw new Error(`Yahoo Finance HTTP ${res.status}`);
    }
    yahooData = await res.json();
  } catch (err) {
    console.error('Erreur Yahoo Finance:', err);
    return new Response(
      JSON.stringify({ error: 'Impossible de joindre Yahoo Finance.', detail: err.message }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ── Normalisation de la réponse ──
  const rawQuotes = yahooData?.quoteResponse?.result ?? [];

  const quotes = rawQuotes.map(q => ({
    symbol:        q.symbol                        ?? null,
    shortName:     q.shortName                     ?? null,
    price:         q.regularMarketPrice            ?? null,
    change:        q.regularMarketChange           ?? null,
    changePercent: q.regularMarketChangePercent    ?? null,
  }));

  return new Response(
    JSON.stringify({ quotes, updatedAt: new Date().toISOString() }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}
