<?php
/**
 * Vista previa (OpenGraph) de la ficha pública.
 *
 * Problema: la web es una SPA (Expo). WhatsApp/Facebook NO ejecutan JavaScript,
 * así que al compartir /ficha/VR-265 leían el HTML genérico y mostraban el logo
 * de "Valera App" en vez de la foto de la casa.
 *
 * Este script se ejecuta en el servidor cuando alguien (o el robot de WhatsApp)
 * abre /ficha/CODIGO: consulta la propiedad, INYECTA las etiquetas og: con la
 * foto/título/precio reales, y devuelve el mismo index.html de la app — así el
 * humano ve la app normal y el robot ve la vista previa correcta.
 */

$codigo = isset($_GET['codigo']) ? preg_replace('/[^A-Za-z0-9._-]/', '', $_GET['codigo']) : '';

// Los dos valores los sustituye el workflow de deploy desde los secrets.
$SUPABASE = '__SUPABASE_URL__';
$ANON     = '__SUPABASE_ANON__';
$BASE     = 'https://valeraapp.valerarealestate.com';

$ogTitle = 'Valera Real Estate';
$ogDesc  = 'Mira esta propiedad disponible';
$ogImage = '';

if ($codigo !== '') {
    $sel = 'titulo,precio,direccion,operacion,tipo,propiedad_imagenes(url,orden)';
    $url = $SUPABASE . '/rest/v1/propiedades?select=' . rawurlencode($sel)
         . '&codigo=eq.' . rawurlencode($codigo)
         . '&limit=1';

    $headers = ["apikey: $ANON", "Authorization: Bearer $ANON", 'Accept: application/json'];
    $raw = false;

    // cURL primero; algunos hostings tienen allow_url_fopen apagado y entonces
    // file_get_contents sobre una URL no funciona.
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 6,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_FOLLOWLOCATION => true,
        ]);
        $res = curl_exec($ch);
        if ($res !== false && curl_getinfo($ch, CURLINFO_HTTP_CODE) === 200) $raw = $res;
        curl_close($ch);
    }
    if ($raw === false) {
        $ctx = stream_context_create([
            'http' => [
                'method'  => 'GET',
                'header'  => implode("\r\n", $headers) . "\r\n",
                'timeout' => 6,
            ],
        ]);
        $raw = @file_get_contents($url, false, $ctx);
    }
    $rows = $raw ? json_decode($raw, true) : null;

    if (!empty($rows[0])) {
        $p = $rows[0];
        if (!empty($p['titulo'])) $ogTitle = $p['titulo'];

        $partes = [];
        if (!empty($p['precio'])) $partes[] = '$' . number_format((float)$p['precio'], 0, '.', ',') . ' MXN';
        if (!empty($p['direccion'])) $partes[] = $p['direccion'];
        if ($partes) $ogDesc = implode(' · ', $partes);

        $imgs = isset($p['propiedad_imagenes']) && is_array($p['propiedad_imagenes']) ? $p['propiedad_imagenes'] : [];
        usort($imgs, function ($a, $b) { return ((int)($a['orden'] ?? 0)) - ((int)($b['orden'] ?? 0)); });
        if (!empty($imgs[0]['url'])) {
            // Se sirve por el proxy para: (1) normalizar a JPG 1200x630 (tamaño
            // que piden WhatsApp/Facebook) y (2) arreglar las fotos de CDNs
            // externos que vienen con content-type raro y rompían la vista previa.
            $ogImage = 'https://wsrv.nl/?url=' . rawurlencode($imgs[0]['url'])
                     . '&w=1200&h=630&fit=cover&output=jpg';
        }
    }
}

$meta  = '<meta property="og:type" content="website">' . "\n";
$meta .= '<meta property="og:site_name" content="Valera Real Estate">' . "\n";
$meta .= '<meta property="og:title" content="' . htmlspecialchars($ogTitle, ENT_QUOTES) . '">' . "\n";
$meta .= '<meta property="og:description" content="' . htmlspecialchars($ogDesc, ENT_QUOTES) . '">' . "\n";
$meta .= '<meta property="og:url" content="' . htmlspecialchars($BASE . '/ficha/' . $codigo, ENT_QUOTES) . '">' . "\n";
if ($ogImage !== '') {
    $meta .= '<meta property="og:image" content="' . htmlspecialchars($ogImage, ENT_QUOTES) . '">' . "\n";
    $meta .= '<meta property="og:image:width" content="1200">' . "\n";
    $meta .= '<meta property="og:image:height" content="630">' . "\n";
    $meta .= '<meta name="twitter:card" content="summary_large_image">' . "\n";
    $meta .= '<meta name="twitter:image" content="' . htmlspecialchars($ogImage, ENT_QUOTES) . '">' . "\n";
}
$meta .= '<meta name="twitter:title" content="' . htmlspecialchars($ogTitle, ENT_QUOTES) . '">' . "\n";
$meta .= '<meta name="twitter:description" content="' . htmlspecialchars($ogDesc, ENT_QUOTES) . '">' . "\n";
$meta .= '<meta name="description" content="' . htmlspecialchars($ogDesc, ENT_QUOTES) . '">' . "\n";

$html = @file_get_contents(__DIR__ . '/index.html');
if ($html === false) {
    header('Location: ' . $BASE . '/');
    exit;
}
// Insertar las etiquetas dentro del <head> del index de la app.
$out = preg_replace('/<\/head>/i', $meta . '</head>', $html, 1);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: public, max-age=300');
echo $out !== null ? $out : $html;
