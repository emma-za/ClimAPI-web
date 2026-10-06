// Tormentas y huracanes activos (NHC/CPHC de NOAA: Atlántico, Pacífico este y central).
// Muestra: trayectoria pasada y pronosticada, cono de incertidumbre, radios de viento, intensidad/categoría,
// velocidad, presión, y la hora estimada de mayor acercamiento a cualquier lugar que consultes.
(() => {
  const SVC = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer';
  const KT = 1.852, MPH = 1.609;                      // nudos y millas por hora -> km/h
  const FONT = ['Noto Sans Regular'];
  const COLORS = { TD: '#7aa2ff', TS: '#7dffb3', 1: '#ffe066', 2: '#ffb347', 3: '#ff7a45', 4: '#ff4d4d', 5: '#ff5cf0', X: '#b0b0c0' };
  const TZ = { AST: -4, ADT: -3, EDT: -4, EST: -5, CDT: -5, CST: -6, MDT: -6, MST: -7, PDT: -7, PST: -8, HST: -10, UTC: 0, GMT: 0 };
  const ROSE = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];

  // 15 "ranuras" del NHC: AT1-5, EP1-5, CP1-5. Cada una ocupa 26 capas del servicio.
  const SLOTS = [];
  ['AT', 'EP', 'CP'].forEach((p, pi) => { for (let i = 0; i < 5; i++) SLOTS.push({ id: p + (i + 1), base: 4 + 26 * (pi * 5 + i) }); });

  const valid = v => v != null && v !== 9999 && v !== -9999;
  const catKey = (kt, type) => /^(LO|DB|EX|PT|WV|RE|SD)$/.test(type) ? 'X'
    : kt >= 137 ? 5 : kt >= 113 ? 4 : kt >= 96 ? 3 : kt >= 83 ? 2 : kt >= 64 ? 1 : kt >= 34 ? 'TS' : 'TD';
  const catName = (k, type) => {
    const sub = /^S[TD]/.test(type || '') && type.length === 3 ? ' subtropical' : '';
    return ({ TD: 'Depresión tropical', TS: 'Tormenta tropical', X: 'Baja / remanente' }[k] || `Huracán cat. ${k}`) + sub;
  };
  const kmh = kt => Math.round(kt * KT);
  const dirName = deg => ROSE[Math.round(deg / 22.5) % 16];

  function parseTime(p) {                               // "2026-09-29 8:00 AM Tue AST" -> ms UTC
    const m = /(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}) (AM|PM)/.exec(p.fldatelbl || '');
    if (!m) return null;
    let h = +m[4] % 12 + (m[6] === 'PM' ? 12 : 0);
    return Date.UTC(+m[1], +m[2] - 1, +m[3], h, +m[5]) - (TZ[p.timezone] ?? 0) * 3600e3;
  }
  const fmtTime = (t, tz) => new Date(t).toLocaleString('es', { timeZone: tz, weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtShort = t => new Date(t).toLocaleString('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

  const hav = (la1, lo1, la2, lo2) => {
    const R = Math.PI / 180, a = Math.sin((la2 - la1) * R / 2) ** 2 + Math.cos(la1 * R) * Math.cos(la2 * R) * Math.sin((lo2 - lo1) * R / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
  };

  async function q(layer) {
    try {
      const r = await fetch(`${SVC}/${layer}/query?where=1%3D1&outFields=*&f=geojson`);
      if (!r.ok) return [];
      return (await r.json()).features || [];
    } catch { return []; }
  }

  async function loadStorm(slot) {
    const fcPts = await q(slot.base + 2);
    if (!fcPts.length) return null;
    const [track, cone, pastPts, radii] = await Promise.all([slot.base + 3, slot.base + 4, slot.base + 7, slot.base + 10].map(q));
    const fc = fcPts.map(f => {
      const p = f.properties, kt = p.maxwind;
      return {
        lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], tau: p.tau, kt, type: p.stormtype,
        mslp: valid(p.mslp) ? p.mslp : null, spd: valid(p.tcspd) ? p.tcspd : null, dir: valid(p.tcdir) ? p.tcdir : null,
        gust: p.gust, t: parseTime(p), cat: catKey(kt, p.stormtype), raw: p
      };
    }).sort((a, b) => a.tau - b.tau);
    const p0 = fc[0].raw;
    const name = (track[0]?.properties.stormname || p0.stormname).replace(/^(Major Hurricane|Hurricane|Tropical Depression|Tropical Storm|Subtropical (Depression|Storm)|Post-Tropical Cyclone|Potential Tropical Cyclone|Remnants of)\s+/i, '');
    const past = pastPts.map(f => {
      const p = f.properties;
      return { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], kt: p.intensity, dtg: p.dtg, type: p.stormtype, cat: catKey(p.intensity, p.stormtype) };
    }).sort((a, b) => a.dtg - b.dtg);
    // Línea de tiempo de la tormenta: puntos pasados (cada 6 h) + puntos del pronóstico, ordenados por instante
    const dtgMs = d => Date.UTC(Math.floor(d / 1e6), Math.floor(d / 1e4) % 100 - 1, Math.floor(d / 100) % 100, d % 100);
    const tl = [
      ...past.map(p => ({ t: dtgMs(+p.dtg), lat: p.lat, lon: p.lon, kt: p.kt, type: p.type })),
      ...fc.map(p => ({ t: p.t, lat: p.lat, lon: p.lon, kt: p.kt, type: p.type }))
    ].filter(p => p.t != null && !isNaN(p.t)).sort((a, b) => a.t - b.t)
      .filter((p, i, arr) => !i || p.t !== arr[i - 1].t);
    // radios de viento del último análisis
    const latest = radii.reduce((m, f) => (f.properties.synoptime > m ? f.properties.synoptime : m), '');
    return {
      slot: slot.id, name, basin: p0.basin, adv: { num: p0.advisnum, date: p0.advdate },
      cur: fc[0], fc, past, tl, cone, radii: radii.filter(f => f.properties.synoptime === latest && f.geometry)
    };
  }

  // ---------- estado ----------
  let storms = [], map = null, markers = [];
  const empty = { type: 'FeatureCollection', features: [] };
  const fcol = features => ({ type: 'FeatureCollection', features });
  const feat = (geometry, properties) => ({ type: 'Feature', geometry, properties });

  function refreshSources() {
    const cone = [], radii = [], pastLine = [], fcLine = [], fcPts = [], pastPts = [], cur = [];
    for (const s of storms) {
      cone.push(...s.cone.map(f => feat(f.geometry, { slot: s.slot })));
      for (const f of s.radii) {
        const r = f.properties.radii;
        radii.push(feat(f.geometry, { slot: s.slot, color: r >= 64 ? '#ff4d4d' : r >= 50 ? '#ffb347' : '#ffe066' }));
      }
      for (let i = 1; i < s.past.length; i++) {
        const a = s.past[i - 1], b = s.past[i];
        pastLine.push(feat({ type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] }, { slot: s.slot, color: COLORS[b.cat] }));
      }
      const last = s.past[s.past.length - 1];
      const path = s.fc.map(p => [p.lon, p.lat]);
      if (last && s.fc.length) path.unshift([last.lon, last.lat]);
      if (path.length > 1) fcLine.push(feat({ type: 'LineString', coordinates: path }, { slot: s.slot }));
      s.past.forEach(p => pastPts.push(feat({ type: 'Point', coordinates: [p.lon, p.lat] }, { slot: s.slot, color: COLORS[p.cat] })));
      s.fc.forEach(p => fcPts.push(feat({ type: 'Point', coordinates: [p.lon, p.lat] }, {
        slot: s.slot, color: COLORS[p.cat], label: p.tau ? `${fmtShort(p.t)}\n${kmh(p.kt)} km/h` : ''
      })));
      cur.push(feat({ type: 'Point', coordinates: [s.cur.lon, s.cur.lat] }, { slot: s.slot, name: s.name.toUpperCase(), color: COLORS[s.cur.cat] }));
    }
    const set = (id, d) => map.getSource(id)?.setData(fcol(d));
    set('storm-cone', cone); set('storm-radii', radii); set('storm-past-line', pastLine); set('storm-fc-line', fcLine);
    set('storm-fc-pts', fcPts); set('storm-past-pts', pastPts); set('storm-cur', cur);
  }

  // ---------- marcador animado (remolino pixelado) ----------
  function swirl(color) {
    const G = 20, c = document.createElement('canvas'); c.width = c.height = G;
    const x = c.getContext('2d'), img = x.createImageData(G, G), R = G / 2;
    const rgb = color.match(/\w\w/g).map(h => parseInt(h, 16));
    for (let py = 0; py < G; py++) for (let px = 0; px < G; px++) {
      const dx = px + 0.5 - R, dy = py + 0.5 - R, r = Math.hypot(dx, dy);
      if (r > R - 0.5) continue;
      const on = r > 1.8 && Math.sin(Math.atan2(dy, dx) * 3 + r * 0.95) > 0.15;
      const i = (py * G + px) * 4;
      const col = on ? rgb : [5, 5, 10];
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = on ? 255 : 140;
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  function rebuildMarkers() {
    markers.forEach(m => m.remove());
    const show = document.getElementById('toggle-storms').checked;
    markers = storms.map(s => {
      const el = document.createElement('div');
      el.className = 'storm-marker';
      el.style.display = show ? '' : 'none';
      el.title = s.name;
      el.dataset.cat = String(s.cur.cat);
      el.appendChild(swirl(COLORS[s.cur.cat]));
      el.addEventListener('click', e => { e.stopPropagation(); showStorm(s); });
      return new maplibregl.Marker({ element: el }).setLngLat([s.cur.lon, s.cur.lat]).addTo(map);
    });
  }

  // ---------- tarjeta de tormenta en el panel ----------
  function showStorm(s) {
    const panel = document.getElementById('panel'), body = document.getElementById('panel-body');
    document.getElementById('hint').hidden = true;
    panel.hidden = false;
    const c = s.cur, col = COLORS[c.cat];
    window.lastWeatherPoint = null;
    const radii = ['34', '50', '64'].map(k => {
      const f = s.radii.find(r => String(r.properties.radii) === k);
      if (!f) return '';
      const nm = Math.max(f.properties.ne, f.properties.se, f.properties.sw, f.properties.nw);
      return nm > 0 ? `<div><span>Vientos ≥ ${kmh(+k)} km/h</span><br>hasta ${Math.round(nm * KT)} km</div>` : '';
    }).join('');
    const rows = s.fc.map(p => `<div class="day"><span>${p.tau ? fmtShort(p.t) : 'Ahora'}</span>
      <span style="color:${COLORS[p.cat]}">■</span><span class="t">${kmh(p.kt)} km/h</span></div>`).join('');
    document.getElementById('panel-body').innerHTML = `
      <div class="clock" style="color:${col}">${s.name.toUpperCase()}</div>
      <h2 class="place">${catName(c.cat, c.type)} · ${s.basin}</h2>
      <div class="coords">Aviso #${s.adv.num} · ${s.adv.date}</div>
      <div class="stats">
        <div><span>Viento máx.</span><br>${kmh(c.kt)} km/h <small>(${c.kt} kt)</small></div>
        <div><span>Rachas</span><br>${c.gust ? kmh(c.gust) + ' km/h' : '—'}</div>
        <div><span>Presión</span><br>${c.mslp ? c.mslp + ' hPa' : '—'}</div>
        <div><span>Movimiento</span><br>${c.spd != null && c.dir != null ? `${dirName(c.dir)} a ${Math.round(c.spd * MPH)} km/h` : '—'}</div>
        ${radii}
        <div><span>Posición</span><br>${c.lat.toFixed(1)}, ${c.lon.toFixed(1)}</div>
      </div>
      <div class="days">${rows}</div>
      <div class="coords" style="margin-top:10px">Fuente: NHC/NOAA. Pronóstico a 5 días; la incertidumbre crece con el tiempo (ver cono).</div>`;
    map.flyTo({ center: [c.lon, c.lat], zoom: Math.max(map.getZoom(), 3.2), essential: true });
  }

  // ---------- llegada / mayor acercamiento a un lugar ----------
  window.stormApproachHTML = (lat, lon, tz) => {
    const items = [];
    for (const s of storms) {
      const pos = s.pos === undefined ? s.cur : s.pos;
      if (!pos) continue;
      const now = hav(lat, lon, pos.lat, pos.lon);
      let best = { km: Infinity };
      for (let i = 0; i < s.fc.length - 1; i++) {
        const a = s.fc[i], b = s.fc[i + 1];
        for (let k = 0; k <= 20; k++) {
          const f = k / 20, la = a.lat + (b.lat - a.lat) * f, lo = a.lon + (b.lon - a.lon) * f;
          const km = hav(lat, lon, la, lo);
          if (km < best.km) best = { km, t: a.t + (b.t - a.t) * f, kt: a.kt + (b.kt - a.kt) * f, idx: i };
        }
      }
      if (Math.min(now, best.km) > 1500) continue;
      const approach = best.idx === 0 && best.km >= now - 1
        ? 'Se aleja o no se acerca más según el pronóstico.'
        : `Mayor acercamiento ~${Math.round(best.km)} km · ${fmtTime(best.t, tz)} (viento ~${kmh(best.kt)} km/h)`;
      items.push({ s, pos, now, approach, col: COLORS[pos.cat] });
    }
    if (!items.length) return '';
    items.sort((a, b) => a.now - b.now);                       // la más cercana primero
    const first = items[0], more = items.length > 1 ? ` <em>+${items.length - 1}</em>` : '';
    const body = items.map(it => `<div class="alert-item" style="--c:${it.col}"><b>${it.s.name.toUpperCase()}</b> · ${catName(it.pos.cat, it.pos.type)}
      <br>${window.timelineOffset ? 'A esa hora' : 'Ahora'} a ${Math.round(it.now)} km. ${it.approach}</div>`).join('');
    return `<details class="alerts" style="--c:${first.col}"><summary>${PX.html('cyclone')}<span><b>${first.s.name.toUpperCase()}</b> a ${Math.round(first.now)} km${more}</span></summary>
      <div class="alert-body">${body}</div></details>`;
  };

  // clic sobre puntos de tormenta (lo usa app.js antes de mostrar el clima del lugar)
  window.stormHit = e => {
    if (!map?.getLayer('storm-fc-pts')) return false;
    const f = map.queryRenderedFeatures(e.point, { layers: ['storm-fc-pts', 'storm-past-pts'] });
    const s = f.length && storms.find(x => x.slot === f[0].properties.slot);
    if (!s) return false;
    showStorm(s);
    return true;
  };

  // Posición e intensidad de una tormenta en el instante tms (null si aún no existía o ya terminó el pronóstico)
  function posAt(s, tms) {
    const T = s.tl;
    if (!T.length || tms < T[0].t || tms > T[T.length - 1].t) return null;
    let i = 0;
    while (i < T.length - 2 && T[i + 1].t < tms) i++;
    const a = T[i], b = T[i + 1] || a, f = b.t === a.t ? 0 : (tms - a.t) / (b.t - a.t);
    let dl = b.lon - a.lon;
    if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;            // cruce del antimeridiano
    const kt = a.kt + (b.kt - a.kt) * f, type = (f < 0.5 ? a : b).type;
    return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + dl * f, kt, type, cat: catKey(kt, type) };
  }

  // La línea de tiempo mueve cada tormenta por su trayectoria (pasada o pronosticada) y actualiza su intensidad
  window.setStormTime = off => {
    if (!map) return;
    const t = Date.now() + off * 3600e3;
    storms.forEach((s, i) => {
      s.pos = off === 0 ? s.cur : posAt(s, t);
      const mk = markers[i];
      if (!mk) return;
      const el = mk.getElement(), p = s.pos;
      if (!p) { el.style.visibility = 'hidden'; return; }               // a esa hora no existía / sin pronóstico
      el.style.visibility = '';
      mk.setLngLat([p.lon, p.lat]);
      if (el.dataset.cat !== String(p.cat)) { el.dataset.cat = String(p.cat); el.replaceChildren(swirl(COLORS[p.cat])); }
    });
    map.getSource('storm-cur')?.setData(fcol(storms.filter(s => s.pos).map(s =>
      feat({ type: 'Point', coordinates: [s.pos.lon, s.pos.lat] }, { slot: s.slot, name: s.name.toUpperCase(), color: COLORS[s.pos.cat] }))));
    renderList();
  };

  function renderList() {
    const list = document.getElementById('storm-list'), count = document.getElementById('storm-count');
    count.textContent = storms.length || '';
    list.innerHTML = '';
    if (!storms.length) { list.innerHTML = '<small>Sin tormentas activas</small>'; return; }
    for (const s of storms) {
      const b = document.createElement('button');
      b.className = 'storm-item';
      const p = s.pos === undefined ? s.cur : s.pos;
      b.style.color = p ? COLORS[p.cat] : COLORS.X;
      b.textContent = p ? `${s.name} · ${typeof p.cat === 'number' ? 'H' + p.cat : p.cat} · ${kmh(p.kt)} km/h` : `${s.name} · sin datos a esa hora`;
      b.onclick = () => showStorm(s);
      list.appendChild(b);
    }
  }

  let readyResolve;
  window.stormsReady = new Promise(r => { readyResolve = r; });

  async function refresh() {
    try {
      const all = await Promise.all(SLOTS.map(loadStorm));
      storms = all.filter(Boolean);
      refreshSources(); rebuildMarkers(); renderList();
      window.setStormTime(window.timelineOffset || 0);
    } catch {
      document.getElementById('storm-count').textContent = '!';
    }
    readyResolve();
  }

  window.activeStormNames = () => storms.map(s => s.name.toLowerCase());

  // tormentas con su intensidad a la hora de la línea de tiempo (para la postal compartible)
  window.climapiStormList = () => storms.map(s => {
    const p = s.pos === undefined ? s.cur : s.pos;
    return p && { name: s.name, label: catName(p.cat, p.type), kmh: kmh(p.kt), color: COLORS[p.cat] };
  }).filter(Boolean);

  window.initStorms = function (m) {
    map = m;
    for (const id of ['storm-cone', 'storm-radii', 'storm-past-line', 'storm-fc-line', 'storm-fc-pts', 'storm-past-pts', 'storm-cur'])
      m.addSource(id, { type: 'geojson', data: empty });
    const before = 'cities-3-dot';

    m.addLayer({ id: 'storm-radii', type: 'fill', source: 'storm-radii', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.28 } }, before);
    m.addLayer({ id: 'storm-cone', type: 'fill', source: 'storm-cone', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.1 } }, before);
    m.addLayer({ id: 'storm-cone-line', type: 'line', source: 'storm-cone', paint: { 'line-color': '#ffffff', 'line-opacity': 0.7, 'line-width': 1, 'line-dasharray': [2, 2] } }, before);
    m.addLayer({ id: 'storm-past-casing', type: 'line', source: 'storm-past-line', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#000', 'line-width': 5, 'line-opacity': 0.7 } }, before);
    m.addLayer({ id: 'storm-past-line', type: 'line', source: 'storm-past-line', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 2.5 } }, before);
    m.addLayer({ id: 'storm-fc-casing', type: 'line', source: 'storm-fc-line', paint: { 'line-color': '#000', 'line-width': 4, 'line-opacity': 0.7 } }, before);
    m.addLayer({ id: 'storm-fc-line', type: 'line', source: 'storm-fc-line', paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [1.5, 1.5] } }, before);
    m.addLayer({ id: 'storm-past-pts', type: 'circle', source: 'storm-past-pts', paint: { 'circle-radius': 2.5, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#000', 'circle-stroke-width': 0.5 } }, before);
    m.addLayer({ id: 'storm-fc-pts', type: 'circle', source: 'storm-fc-pts', paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#000', 'circle-stroke-width': 1.5 } }, before);
    m.addLayer({
      id: 'storm-fc-labels', type: 'symbol', source: 'storm-fc-pts', minzoom: 2.4,
      layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-padding': 4 },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#05050a', 'text-halo-width': 2 }
    }, before);
    m.addLayer({
      id: 'storm-names', type: 'symbol', source: 'storm-cur',
      layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 14, 'text-anchor': 'bottom', 'text-offset': [0, -1.9], 'text-letter-spacing': 0.05, 'text-allow-overlap': true, 'symbol-sort-key': 1 },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#05050a', 'text-halo-width': 2.2 }
    }, before);

    const ids = ['storm-radii', 'storm-cone', 'storm-cone-line', 'storm-past-casing', 'storm-past-line', 'storm-fc-casing',
                 'storm-fc-line', 'storm-past-pts', 'storm-fc-pts', 'storm-fc-labels', 'storm-names'];
    const cb = document.getElementById('toggle-storms');
    cb.onchange = () => {
      ids.forEach(id => m.setLayoutProperty(id, 'visibility', cb.checked ? 'visible' : 'none'));
      markers.forEach(mk => { mk.getElement().style.display = cb.checked ? '' : 'none'; });
      document.getElementById('storm-list').hidden = !cb.checked;
    };

    refresh();
    setInterval(refresh, 20 * 60 * 1000);
  };
})();
