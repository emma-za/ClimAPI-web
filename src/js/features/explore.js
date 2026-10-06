// Modo Explorar: eventos reales sobre el planeta.
//  - NASA EONET: incendios, volcanes, ciclones (incl. tifones), inundaciones, icebergs...
//  - Récords del día calculados con el clima actual de ~140 ciudades (Open-Meteo): calor, frío, viento, lluvia, tormentas, nieve.
// Al hacer clic en un evento: zoom automático + clima del lugar con una ficha del evento.
(() => {
  const EONET = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=20&limit=200';

  // tipo -> [nombre, icono, color, orden de importancia]
  const KIND = {
    cyclone: ['Ciclón / tifón', 'cyclone', '#ff5cf0', 0],
    volcano: ['Volcán', 'volcano', '#ff4d4d', 1],
    flood: ['Inundación', 'humid', '#4aa3ff', 2],
    fire: ['Incendio forestal', 'fire', '#ff7a45', 3],
    thunder: ['Tormenta eléctrica', 'bolt', '#ffe066', 4],
    hot: ['Calor', 'uv', '#ffb347', 5],
    cold: ['Frío', 'snow', '#7aa2ff', 6],
    wind: ['Viento fuerte', 'wind', '#7dffb3', 7],
    rain: ['Lluvia intensa', 'precip', '#5fc8ff', 8],
    snow: ['Nevada', 'snow', '#e6e6e6', 9],
    dust: ['Polvo / bruma', 'cloud', '#c8a46a', 10],
    drought: ['Sequía', 'uv', '#d6a23c', 11],
    ice: ['Iceberg / hielo', 'snow', '#b4e4ff', 12],
    other: ['Evento', 'sparkles', '#cfcfe0', 13]
  };
  const EONET_KIND = {
    wildfires: 'fire', severeStorms: 'cyclone', volcanoes: 'volcano', floods: 'flood', drought: 'drought',
    dustHaze: 'dust', seaLakeIce: 'ice', snow: 'snow', tempExtremes: 'hot', landslides: 'dust'
  };
  const LIMIT = { fire: 8, ice: 2, dust: 3, drought: 3, snow: 3, hot: 3, flood: 5, volcano: 6, cyclone: 8, other: 3 };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = d => new Date(d).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  let map, events = [], markers = [], seen = new Set();

  // ---------- fuentes de datos ----------
  async function loadEonet(skipNames) {
    const r = await fetch(EONET);
    if (!r.ok) throw new Error(r.status);
    const out = [];
    for (const e of (await r.json()).events) {
      const kind = EONET_KIND[e.categories[0]?.id] || 'other';
      const g = e.geometry[e.geometry.length - 1];
      let [lon, lat] = g.type === 'Point' ? g.coordinates : g.coordinates[0][0];
      if (kind === 'cyclone' && skipNames.some(n => e.title.toLowerCase().endsWith(n))) continue;   // ya está en la capa Tormentas
      const mag = g.magnitudeValue != null ? `${Math.round(g.magnitudeValue)} ${g.magnitudeUnit}` : '';
      const place = e.title.replace(/^(Wildfire|Iceberg)\s+/i, '');
      out.push({
        id: e.id, kind, lat, lon, place, sub: mag, when: g.date, link: e.sources?.[0]?.url,
        rank: g.magnitudeValue || 0, zoom: kind === 'cyclone' ? 4 : kind === 'ice' ? 4 : 6
      });
    }
    // limitar por tipo, priorizando los de mayor magnitud
    const per = {};
    return out.sort((a, b) => b.rank - a.rank).filter(e => (per[e.kind] = (per[e.kind] || 0) + 1) <= (LIMIT[e.kind] || 3));
  }

  async function loadWeatherRecords() {
    const cities = window.CITIES;
    const q = new URLSearchParams({
      latitude: cities.map(c => c.lat).join(','), longitude: cities.map(c => c.lon).join(','),
      current: 'temperature_2m,precipitation,wind_speed_10m,weather_code,snowfall'
    });
    const r = await fetch('https://api.open-meteo.com/v1/forecast?' + q);
    if (!r.ok) throw new Error(r.status);
    const rows = (await r.json()).map((d, i) => ({ c: cities[i], ...d.current }));
    const used = new Set(), out = [];
    const add = (kind, row, sub, title) => {
      if (!row || used.has(row.c.name)) return;
      used.add(row.c.name);
      out.push({ id: kind + row.c.name, kind, lat: row.c.lat, lon: row.c.lon, place: row.c.name, sub, title, when: row.time, zoom: 5.5, city: true });
    };
    const by = (key, desc) => [...rows].sort((a, b) => desc ? b[key] - a[key] : a[key] - b[key]);

    by('temperature_2m', true).slice(0, 2).forEach(r => add('hot', r, `${Math.round(r.temperature_2m)} °C`, 'Lugar más caluroso hoy'));
    by('temperature_2m', false).slice(0, 2).forEach(r => add('cold', r, `${Math.round(r.temperature_2m)} °C`, 'Lugar más frío hoy'));
    by('wind_speed_10m', true).filter(r => r.wind_speed_10m >= 25).slice(0, 2).forEach(r => add('wind', r, `${Math.round(r.wind_speed_10m)} km/h`, 'Viento más fuerte hoy'));
    by('precipitation', true).filter(r => r.precipitation >= 0.3).slice(0, 2).forEach(r => add('rain', r, `${r.precipitation} mm`, 'Lluvia más intensa ahora'));
    rows.filter(r => r.weather_code >= 95).slice(0, 3).forEach(r => add('thunder', r, 'tormenta eléctrica', 'Tormenta eléctrica ahora'));
    rows.filter(r => r.snowfall > 0 || [71, 73, 75, 77, 85, 86].includes(r.weather_code)).slice(0, 2).forEach(r => add('snow', r, 'nevando', 'Nevando ahora'));
    return out;
  }

  // ---------- marcadores ----------
  function buildMarkers() {
    markers.forEach(m => m.remove());
    const show = document.getElementById('toggle-events').checked;
    markers = events.map(ev => {
      const [, icon, color] = KIND[ev.kind];
      const el = document.createElement('button');
      el.className = 'ev';
      el.style.setProperty('--c', color);
      el.style.display = show ? '' : 'none';
      el.setAttribute('aria-label', `${KIND[ev.kind][0]}: ${ev.place}`);
      el.innerHTML = `${PX.html(icon)}<span class="ev-label">${esc(ev.place)}${ev.sub ? ' · ' + esc(ev.sub) : ''}</span>`;
      el.addEventListener('click', e => { e.stopPropagation(); goTo(ev); });
      return new maplibregl.Marker({ element: el }).setLngLat([ev.lon, ev.lat]).addTo(map);
    });
  }

  function renderList() {
    document.getElementById('ev-count').textContent = events.length || '';
    const list = document.getElementById('ev-list');
    list.innerHTML = '';
    if (!events.length) { list.innerHTML = '<small>No se pudieron cargar los eventos</small>'; return; }
    for (const ev of events) {
      const [name, icon, color] = KIND[ev.kind];
      const b = document.createElement('button');
      b.className = 'ev-item';
      b.style.setProperty('--c', color);
      b.innerHTML = `${PX.html(icon)}<span><b>${esc(ev.place)}</b><small>${name}${ev.sub ? ' · ' + esc(ev.sub) : ''}</small></span>`;
      b.onclick = () => goTo(ev);
      list.appendChild(b);
    }
  }

  // ---------- ir a un evento ----------
  async function goTo(ev) {
    seen.add(ev.id);
    document.querySelectorAll('.rail-btn[aria-expanded="true"]').forEach(b => b.click());   // cierra el panel abierto
    map.flyTo({ center: [ev.lon, ev.lat], zoom: ev.zoom, speed: 0.9, curve: 1.5, essential: true });
    await showWeather(ev.lon, ev.lat, ev.place);
    const [name, , color] = KIND[ev.kind];
    const [, icon] = KIND[ev.kind];
    const extra = [ev.when ? esc(fmtDate(ev.when)) : '', ev.link ? `<a href="${esc(ev.link)}" target="_blank" rel="noopener">Ver fuente</a>` : ''].filter(Boolean).join(' · ');
    window.panelAlert?.(`<details class="alerts" style="--c:${color}" open><summary>${PX.html(icon)}<span><b>${esc(ev.title || name).toUpperCase()}</b>${ev.sub ? ' · ' + esc(ev.sub) : ''}</span></summary>
      ${extra ? `<div class="alert-body">${extra}</div>` : ''}</details>`);
  }

  function surprise() {
    if (!events.length) return;
    let pool = events.filter(e => !seen.has(e.id));
    if (!pool.length) { seen.clear(); pool = events; }
    goTo(pool[Math.floor(Math.random() * pool.length)]);
  }

  async function refresh() {
    try {
      // espera (máx. 30 s) a que carguen las tormentas del NHC para no mostrarlas dos veces
      await Promise.race([window.stormsReady, new Promise(r => setTimeout(r, 30000))]);
      const storms = (window.activeStormNames?.() || []);
      const [a, b] = await Promise.allSettled([loadEonet(storms), loadWeatherRecords()]);
      events = [...(a.value || []), ...(b.value || [])].sort((x, y) => KIND[x.kind][3] - KIND[y.kind][3]);
    } catch { events = []; }
    buildMarkers(); renderList();
  }

  window.climapiExplore = { events: () => events, KIND };         // lo usa la postal compartible

  window.initExplore = function (m) {
    map = m;
    const cb = document.getElementById('toggle-events');
    cb.onchange = () => markers.forEach(mk => { mk.getElement().style.display = cb.checked ? '' : 'none'; });
    document.getElementById('ev-random').onclick = surprise;
    // las etiquetas de los eventos aparecen solas al acercarse
    const sync = () => document.body.classList.toggle('zoomed-in', map.getZoom() >= 3.4);
    map.on('zoom', sync); sync();
    refresh();
    setInterval(refresh, 30 * 60 * 1000);
  };
})();
