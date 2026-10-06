// Compartir una vista: todo el estado queda en la URL (#c=lng,lat&z=3&m=wind&t=...&l=-names,+sat&p=lat,lon)
// y se restaura al abrir el enlace. No hay servidor ni cuentas: el enlace es la vista.
//   c = centro de la cámara, z = zoom, m = dato elegido (si no es temperatura),
//   t = instante que se ve (segundos Unix; solo si no es "ahora"), l = capas distintas al estado por defecto,
//   p = lugar con el panel de clima abierto.
(() => {
  const $ = id => document.getElementById(id);
  const DEFAULT_ON = {
    'toggle-wind': 1, 'toggle-clouds': 1, 'toggle-night': 1, 'toggle-borders': 1, 'toggle-names': 1,
    'toggle-storms': 1, 'toggle-events': 1, 'toggle-field': 1, 'toggle-sat': 0
  };

  // ---------- 1) leer el enlace (antes de crear el mapa) ----------
  const params = {};
  location.hash.replace(/^#/, '').split('&').filter(Boolean).forEach(kv => {
    const i = kv.indexOf('=');
    if (i > 0) params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  });
  const num = v => (v !== undefined && v !== '' && isFinite(+v) ? +v : null);
  const pair = v => {
    const p = (v || '').split(',').map(Number);
    return p.length === 2 && p.every(isFinite) ? p : null;
  };
  const c = pair(params.c), z = num(params.z);
  window.__view = {
    center: c && Math.abs(c[1]) <= 90 ? [((c[0] + 540) % 360) - 180, c[1]] : null,
    zoom: z !== null ? Math.min(10, Math.max(0.5, z)) : null
  };
  if (!window.__view.center) delete window.__view.center;
  if (window.__view.zoom === null) delete window.__view.zoom;

  // ---------- 2) escribir la URL con el estado actual ----------
  const nowRounded = () => Math.round(Date.now() / 1800e3) * 1800;          // "ahora" a 30 min
  let timer = 0;

  function currentHash() {
    if (typeof map === 'undefined') return '';
    const ctr = map.getCenter(), out = [];
    out.push(`c=${ctr.lng.toFixed(2)},${ctr.lat.toFixed(2)}`, `z=${map.getZoom().toFixed(1)}`);
    const m = window.climapi?.activeMetric?.();
    if (m && m !== 'temp') out.push(`m=${m}`);
    const off = window.timelineOffset || 0;
    if (off) out.push(`t=${Math.round((Date.now() + off * 3600e3) / 1800e3) * 1800}`);
    const diff = Object.keys(DEFAULT_ON).filter(id => $(id) && $(id).checked !== !!DEFAULT_ON[id])
      .map(id => (DEFAULT_ON[id] ? '-' : '+') + id.slice(7));
    if (diff.length) out.push(`l=${diff.join(',')}`);
    const p = window.lastWeatherPoint;
    if (p) out.push(`p=${p.lat.toFixed(3)},${p.lon.toFixed(3)}`);
    return '#' + out.join('&');
  }

  function write() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { history.replaceState(null, '', currentHash() || location.pathname); } catch { /* p. ej. file:// */ }
    }, 350);
  }
  window.shareTouch = write;

  // ---------- 3) restaurar el resto del estado cuando las capas ya están listas ----------
  const setCb = (id, v) => {
    const el = $(id);
    if (el && el.checked !== v) { el.checked = v; el.dispatchEvent(new Event('change', { bubbles: true })); }
  };

  function toast(msg, ms = 2600) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, ms);
  }

  function restore() {
    // capas
    (params.l || '').split(',').filter(Boolean).forEach(tok => {
      const on = tok[0] === '+', id = 'toggle-' + tok.slice(1);
      if (id in DEFAULT_ON) setCb(id, on);
    });
    // dato
    if (params.m) window.climapi?.selectMetric?.(params.m);
    // hora
    const t = num(params.t);
    if (t !== null) {
      const off = Math.round(((t * 1000 - Date.now()) / 3600e3) * 2) / 2;
      if (off >= -12 && off <= 24) {
        const r = $('tl-range');
        r.value = off;
        r.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        toast('El momento del enlace ya no está disponible; se muestra "ahora".', 4500);
      }
    }
    // lugar
    const p = pair(params.p);
    if (p && Math.abs(p[0]) <= 90 && typeof showWeather === 'function') setTimeout(() => showWeather(p[1], p[0]), 400);
    write();
  }

  // espera a que el mapa y los datos horarios estén listos (hasta 2 min)
  let waited = 0;
  const wait = setInterval(() => {
    waited += 400;
    const ready = typeof map !== 'undefined' && typeof window.setTimelineHours === 'function'
      && window.climapi && !$('toggle-night').disabled && !$('toggle-field').disabled;
    if (ready) { clearInterval(wait); restore(); }
    else if (waited > 120000) clearInterval(wait);
  }, 400);

  // ---------- 4) mantener el enlace al día ----------
  addEventListener('DOMContentLoaded', () => {
    const waitMap = setInterval(() => {
      if (typeof map === 'undefined') return;
      clearInterval(waitMap);
      map.on('moveend', write);
    }, 200);
    document.addEventListener('change', e => {
      if (e.target.matches?.('#metrics input, [id^="toggle-"]')) write();
    });
    $('tl-range')?.addEventListener('input', write);
    $('tl-range')?.addEventListener('change', write);
    $('tl-now')?.addEventListener('click', write);

    // ---------- 5) botón de compartir ----------
    $('share-btn').addEventListener('click', async () => {
      const url = location.origin + location.pathname + (currentHash() || '');
      try { history.replaceState(null, '', currentHash()); } catch { /* ignore */ }
      try {
        await navigator.clipboard.writeText(url);
        toast('Enlace copiado: esta vista queda guardada en él');
      } catch {
        window.prompt('Copia el enlace de esta vista:', url);       // sin permiso de portapapeles
      }
    });
  });
})();
