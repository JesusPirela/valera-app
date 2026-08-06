import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const REDIRECT = 'https://ystxicgrryyzhrxinsbq.supabase.co/functions/v1/ml-oauth-callback'

function pagina(msg: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
     <body style="font-family:system-ui,sans-serif;padding:48px;text-align:center;color:#123">
       <h2>Valera × Mercado Libre</h2><p style="font-size:16px">${msg}</p>
     </body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

// Recibe la redirección de Mercado Libre tras autorizar, canjea el `code` por
// tokens y guarda el refresh_token para publicar después sin re-loguear.
serve(async (req) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const errorParam = url.searchParams.get('error')
    if (errorParam) return pagina(`Autorización cancelada o con error: ${errorParam}. Puedes cerrar esta pestaña.`)
    if (!code) return pagina('Falta el parámetro <b>code</b>. Abre el link de autorización de nuevo.')

    const CLIENT_ID = Deno.env.get('ML_CLIENT_ID')!
    const CLIENT_SECRET = Deno.env.get('ML_CLIENT_SECRET')!
    const body = new URLSearchParams({
      grant_type: 'authorization_code', client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      code, redirect_uri: REDIRECT,
    })
    const r = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const j = await r.json()
    if (!r.ok || !j.access_token) return pagina(`No se pudo obtener el token: ${JSON.stringify(j).slice(0, 300)}`)

    let nickname: string | null = null
    try {
      const u = await fetch('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${j.access_token}` } })
      nickname = (await u.json())?.nickname ?? null
    } catch { /* opcional */ }

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await db.from('ml_integracion').upsert({
      id: 1, ml_user_id: j.user_id, nickname,
      access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: new Date(Date.now() + (j.expires_in ?? 21600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })

    return pagina(`✅ Cuenta de Mercado Libre conectada${nickname ? ` (<b>${nickname}</b>)` : ''}. Ya puedes cerrar esta pestaña y volver a la app.`)
  } catch (e) {
    return pagina(`Error inesperado: ${String((e as any)?.message ?? e)}`)
  }
})
