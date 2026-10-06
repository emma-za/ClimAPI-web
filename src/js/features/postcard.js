// Postal compartible: una imagen PNG en pixel art (1200×720) con el globo tal como lo ves
// (capas, hora de la línea de tiempo y satélite incluidos) y, al lado, la ficha del lugar abierto
// o un resumen "El planeta hoy" con las tormentas y los eventos destacados.
// Se puede descargar, copiar al portapapeles o compartir (móvil).
(() => {
  const W = 1200, H = 720;
  const GLOBE = { x: 48, y: 108, size: 576, grid: 192 };          // el globo se pixela a 192×192 y se amplía ×3
  const X0 = 672, COLW = 480;                                       // columna derecha
  const C = { bg: '#0a0a0f', panel: '#101018', line: '#e6e6e6', dim: '#7a7a8c', accent: '#7dffb3', warn: '#ffe066' };
  const $ = id => document.getElementById(id);
  const FT = s => `${s}px VT323, monospace`;
  const FS = s => `700 ${s}px Silkscreen, monospace`;

  // ---------- utilidades de dibujo ----------
  function rng(seed) {                                               // PRNG determinista: las mismas estrellas cada día
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function text(ctx, s, x, y, font, color, align = 'left', maxW) {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    maxW ? ctx.fillText(s, x, y, maxW) : ctx.fillText(s, x, y);
  }
  function box(ctx, x, y, w, h, { fill = C.panel, stroke = C.line, shadow = true } = {}) {
    if (shadow) { ctx.fillStyle = '#000'; ctx.fillRect(x + 6, y + 6, w, h); }
    ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = stroke; ctx.lineWidth = 4; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  }
  function wrap(ctx, s, maxW, font, maxLines) {
    ctx.font = font;
    const lines = []; let cur = '';
    for (const word of s.split(' ')) {
      const t = cur ? cur + ' ' + word : word;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = word; } else cur = t;
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…'); }
    return lines;
  }

  // Iconos pixel (los mismos de la interfaz): se cargan como SVG y se tiñen al color pedido
  const iconCache = new Map();
  async function icon(name, color) {
    const key = name + color;
    if (iconCache.has(key)) return iconCache.get(key);
    const u = PX.url(name).match(/^url\("(.*)"\)$/)[1];
    let svg = u.startsWith('data:image/svg+xml,') ? decodeURIComponent(u.slice(19)) : await (await fetch(u)).text();
    const n = +(svg.match(/viewBox="0 0 (\d+) \d+"/)?.[1] || 24);
    svg = svg.replace('<svg ', `<svg width="${n}" height="${n}" `);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
    const c = Object.assign(document.createElement('canvas'), { width: n, height: n });
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, n, n);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color; x.fillRect(0, 0, n, n);
    iconCache.set(key, c);
    return c;
  }
  async function drawIcon(ctx, name, color, x, y, size) {
    try { const c = await icon(name, color); ctx.imageSmoothingEnabled = false; ctx.drawImage(c, x, y, size, size); } catch { /* sin icono */ }
  }

  // ---------- captura del globo ----------
  function limbRadiusPx() {                                          // radio del globo en px CSS (punto a ~90° del centro)
    const c = map.getCenter(), p0 = map.project([c.lng, c.lat]), p1 = map.project([c.lng + 89.9, c.lat]);
    return Math.hypot(p1.x - p0.x, p1.y - p0.y);
  }
  function snapshotMap() {
    return new Promise(resolve => {
      const grab = () => {
        const src = map.getCanvas(), cw = src.width, ch = src.height, k = cw / src.clientWidth;
        let side = Math.min(cw, ch);
        if (map.getProjection?.().type === 'globe' || true) {
          const r = limbRadiusPx() * k;
          if (r && r * 2 * 1.15 < side) side = Math.round(r * 2 * 1.15);          // el globo cabe entero: recorte ajustado
        }
        const small = Object.assign(document.createElement('canvas'), { width: GLOBE.grid, height: GLOBE.grid });
        const sc = small.getContext('2d');
        sc.imageSmoothingEnabled = true;
        const sx = (cw - side) / 2, sy = (ch - side) / 2;
        sc.drawImage(src, sx, sy, side, side, 0, 0, GLOBE.grid, GLOBE.grid);
        return { canvas: small, sx, sy, side, k };                    // geometría del recorte, para situar marcas encima
      };
      let done = false;
      map.once('render', () => { if (!done) { done = true; resolve(grab()); } });   // dentro del frame, el búfer WebGL es válido
      map.triggerRepaint();
      setTimeout(() => { if (!done) { done = true; resolve(grab()); } }, 1500);
    });
  }

  // ---------- composición ----------
  async function compose() {
    await Promise.all([document.fonts.load(FS(20)), document.fonts.load(FT(28))]);
    const off = Math.round(window.timelineOffset || 0);
    const when = new Date(Date.now() + off * 3600e3);
    const dateStr = when.toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/\./g, '').toUpperCase();
    const globe = await snapshotMap();

    const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // fondo con estrellas (distintas cada día)
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const rand = rng(when.getUTCFullYear() * 400 + when.getUTCMonth() * 31 + when.getUTCDate());
    for (let i = 0; i < 170; i++) {
      const s = rand() < 0.12 ? 6 : 3;
      ctx.fillStyle = `rgba(235,240,255,${(0.25 + rand() * 0.6).toFixed(2)})`;
      ctx.fillRect(Math.floor(rand() * (W / 3)) * 3, Math.floor(rand() * (H / 3)) * 3, s, s);
    }
    // marco
    ctx.strokeStyle = C.line; ctx.lineWidth = 6; ctx.strokeRect(12, 12, W - 24, H - 24);

    // cabecera
    text(ctx, 'CLIMAPI', 48, 80, FS(40), C.accent);
    text(ctx, (off ? 'PRONÓSTICO ' + (off > 0 ? '+' : '') + off + ' H · ' : '') + dateStr, W - 48, 78, FT(34), off ? C.warn : C.dim, 'right');

    // globo pixelado (192×192 -> 576×576, sin suavizado)
    ctx.drawImage(globe.canvas, GLOBE.x, GLOBE.y, GLOBE.size, GLOBE.size);

    const place = !$('panel').hidden && window.lastWeatherPoint && window.lastWeatherData;
    if (place) {
      markPlace(ctx, globe, window.lastWeatherData);
      await drawPlace(ctx, window.lastWeatherData);
    }
    else await drawPlanet(ctx, dateStr);

    // pie
    text(ctx, 'DATOS: OPEN-METEO · NOAA · NASA · OPENSTREETMAP', 48, H - 30, FT(22), C.dim);
    text(ctx, 'climapi', W - 48, H - 30, FS(14), C.accent, 'right');
    return cv;
  }

  // Marca (cuadrado pixel) sobre el globo en el lugar de la ficha, si está en el hemisferio visible
  function markPlace(ctx, g, d) {
    const R = Math.PI / 180, c = map.getCenter();
    const ang = Math.acos(Math.min(1, Math.max(-1, Math.sin(c.lat * R) * Math.sin(d.lat * R) + Math.cos(c.lat * R) * Math.cos(d.lat * R) * Math.cos((d.lon - c.lng) * R))));
    if (ang > 82 * R) return;
    const p = map.project([d.lon, d.lat]);
    const x = GLOBE.x + (p.x * g.k - g.sx) / g.side * GLOBE.size, y = GLOBE.y + (p.y * g.k - g.sy) / g.side * GLOBE.size;
    if (x < GLOBE.x || y < GLOBE.y || x > GLOBE.x + GLOBE.size || y > GLOBE.y + GLOBE.size) return;
    const s = Math.round(x / 3) * 3, t = Math.round(y / 3) * 3;               // alineado a la cuadrícula de píxeles
    ctx.fillStyle = '#000'; ctx.fillRect(s - 18, t - 18, 36, 36);
    ctx.fillStyle = C.accent; ctx.fillRect(s - 12, t - 12, 24, 24);
    ctx.fillStyle = '#000'; ctx.fillRect(s - 6, t - 6, 12, 12);
  }

  // Ficha de un lugar
  async function drawPlace(ctx, d) {
    let y = 140;
    wrap(ctx, d.label.toUpperCase(), COLW, FS(24), 2).forEach(l => { text(ctx, l, X0, y, FS(24), C.line); y += 32; });
    text(ctx, `${d.lat.toFixed(2)}, ${d.lon.toFixed(2)} · ${d.tz.split('/').pop().replace('_', ' ')} · ${d.time.slice(11, 16)}`, X0, y + 4, FT(26), C.dim);

    // temperatura
    const hy = 262;
    await drawIcon(ctx, d.icon, C.accent, X0, hy - 64, 96);
    text(ctx, `${d.temp}°`, X0 + 112, hy + 24, FT(120), C.line);
    const tw = (ctx.font = FT(120), ctx.measureText(`${d.temp}°`).width);
    text(ctx, d.desc, X0 + 112 + tw + 16, hy - 14, FT(36), C.line, 'left', COLW - 128 - tw);
    text(ctx, `Sensación ${d.feels}°`, X0 + 112 + tw + 16, hy + 20, FT(28), C.dim);

    // anomalía ("¿es normal?")
    let ay = 316;
    if (d.anomaly) {
      const a = d.anomaly;
      box(ctx, X0, ay, COLW, 112, { stroke: a.color });
      text(ctx, a.delta, X0 + 16, ay + 52, FT(56), a.color);
      const dw = (ctx.font = FT(56), ctx.measureText(a.delta).width);
      text(ctx, a.head, X0 + 16 + dw + 18, ay + 48, FT(32), C.line, 'left', COLW - 48 - dw);
      const segs = ['#5a6bff', '#7aa2ff', '#9a9ab0', '#ffb347', '#ff4d4d'], sw = (COLW - 32 - 16) / 5;
      segs.forEach((c, i) => { ctx.globalAlpha = 0.6; ctx.fillStyle = c; ctx.fillRect(X0 + 16 + i * (sw + 4), ay + 66, sw, 10); });
      ctx.globalAlpha = 1;
      const mx = X0 + 16 + Math.min(1, Math.max(0, (a.z + 3) / 6)) * (COLW - 32);
      ctx.fillStyle = '#000'; ctx.fillRect(mx - 6, ay + 60, 12, 22); ctx.fillStyle = C.line; ctx.fillRect(mx - 3, ay + 63, 6, 16);
      text(ctx, a.note, X0 + 16, ay + 102, FT(24), C.dim, 'left', COLW - 32);
      ay += 134;
    } else ay += 8;

    // métricas
    const mets = [['humid', `${d.humidity}%`], ['wind', `${d.wind} ${d.units.wind}`], ['press', `${d.pressure} ${d.units.pressure}`], ['precip', `${d.precip} ${d.units.precip}`]];
    for (let i = 0; i < 4; i++) {
      const cx = X0 + i * (COLW / 4) + COLW / 8;
      await drawIcon(ctx, mets[i][0], C.dim, cx - 18, ay, 36);
      text(ctx, mets[i][1], cx, ay + 66, FT(28), C.line, 'center');
    }
    // pronóstico 5 días
    const fy = ay + 96;
    for (let i = 0; i < d.forecast.length; i++) {
      const f = d.forecast[i], cx = X0 + i * (COLW / 5) + COLW / 10;
      text(ctx, f.day.toUpperCase(), cx, fy, FT(24), C.dim, 'center');
      await drawIcon(ctx, f.icon, i === 0 ? C.accent : C.line, cx - 18, fy + 8, 36);
      text(ctx, `${f.max}°`, cx, fy + 78, FT(32), C.line, 'center');
      text(ctx, `${f.min}°`, cx, fy + 104, FT(26), C.dim, 'center');
    }
  }

  // Resumen del planeta (sin lugar abierto)
  async function drawPlanet(ctx, dateStr) {
    text(ctx, 'EL PLANETA HOY', X0, 144, FS(26), C.accent);
    text(ctx, dateStr, X0, 178, FT(30), C.dim);

    const rows = [];
    (window.climapiStormList?.() || []).slice(0, 3).forEach(s => rows.push({ icon: 'cyclone', color: s.color, title: s.name.toUpperCase(), sub: `${s.label} · ${s.kmh} km/h` }));
    const ex = window.climapiExplore;
    if (ex) {
      const seen = new Set();
      [...ex.events()].sort((a, b) => ex.KIND[a.kind][3] - ex.KIND[b.kind][3]).forEach(e => {
        if (e.kind === 'cyclone' || seen.has(e.kind) || rows.length >= 6) return;
        seen.add(e.kind);
        const [name, ic, color] = ex.KIND[e.kind];
        rows.push({ icon: ic, color, title: e.place.length > 26 ? e.place.slice(0, 25) + '…' : e.place, sub: `${name}${e.sub ? ' · ' + e.sub : ''}` });
      });
    }
    if (!rows.length) text(ctx, 'Sin eventos destacados ahora mismo.', X0, 250, FT(34), C.dim);
    let y = 214;
    for (const r of rows.slice(0, 6)) {
      box(ctx, X0, y, COLW - 8, 64, { stroke: r.color });
      await drawIcon(ctx, r.icon, r.color, X0 + 14, y + 14, 36);
      text(ctx, r.title, X0 + 66, y + 30, FT(34), C.line, 'left', COLW - 90);
      text(ctx, r.sub, X0 + 66, y + 54, FT(24), C.dim, 'left', COLW - 90);
      y += 76;
    }
  }

  // ---------- interfaz ----------
  let currentBlob = null, currentUrl = '';

  function close() { $('postcard').hidden = true; if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = ''; } currentBlob = null; }

  async function open() {
    const modal = $('postcard'), img = $('pc-img'), status = $('pc-status');
    modal.hidden = false;
    img.removeAttribute('src');
    status.textContent = 'Generando postal…';
    ['pc-download', 'pc-copy', 'pc-share'].forEach(id => { $(id).disabled = true; });
    try {
      const cv = await compose();
      currentBlob = await new Promise(res => cv.toBlob(res, 'image/png'));
      currentUrl = URL.createObjectURL(currentBlob);
      img.src = currentUrl;
      status.textContent = 'Lista. Descárgala o cópiala para compartirla.';
      ['pc-download', 'pc-copy'].forEach(id => { $(id).disabled = false; });
      const file = new File([currentBlob], 'climapi.png', { type: 'image/png' });
      $('pc-share').hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
      $('pc-share').disabled = false;
    } catch (e) {
      status.textContent = 'No se pudo generar la postal (' + (e.message || e) + ').';
    }
  }

  function fileName() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `climapi-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.png`;
  }

  addEventListener('DOMContentLoaded', () => {
    $('postcard-btn').addEventListener('click', open);
    $('pc-close').addEventListener('click', close);
    $('postcard').addEventListener('click', e => { if (e.target.id === 'postcard') close(); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && !$('postcard').hidden) close(); });

    $('pc-download').addEventListener('click', () => {
      if (!currentUrl) return;
      const a = document.createElement('a');
      a.href = currentUrl; a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
    });
    $('pc-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': currentBlob })]);
        $('pc-status').textContent = 'Imagen copiada al portapapeles.';
      } catch { $('pc-status').textContent = 'Tu navegador no permite copiar imágenes; usa Descargar.'; }
    });
    $('pc-share').addEventListener('click', async () => {
      try { await navigator.share({ files: [new File([currentBlob], fileName(), { type: 'image/png' })], title: 'Climapi' }); } catch { /* cancelado */ }
    });
  });

  window.climapiPostcard = { open };
})();
