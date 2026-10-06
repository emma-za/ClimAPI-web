// Capas tipo Windy: mapa de calor seleccionable (8 variables) + partículas de viento animadas.
// Datos: rejilla global de Open-Meteo, interpolada bilinealmente y dibujada en canvas
// con proyección Mercator (MapLibre lo reproyecta sobre el globo).
(() => {
  const STEP = 15;                                   // grados entre puntos de la rejilla
  const LATS = []; for (let l = -75; l <= 75; l += STEP) LATS.push(l);
  const NLON = 360 / STEP;
  const MAXLAT = 85.0511;
  const CACHE_KEY = 'climapi-grid-v4';

  // Cada capa: variable de Open-Meteo, unidad, paso de cuantización (efecto pixel) y rampa [valor, r, g, b, alpha?]
  const METRICS = [
    { id: 'temp',   label: 'Temperatura',   key: 'temperature_2m',       unit: '°C',   step: 4,
      stops: [[-35, 90, 60, 200], [-15, 60, 140, 230], [0, 90, 210, 235], [8, 60, 200, 120], [16, 170, 225, 60],
              [22, 250, 220, 40], [28, 250, 140, 30], [34, 230, 50, 30], [42, 140, 20, 40]] },
    { id: 'precip', label: 'Precipitación', key: 'precipitation',        unit: 'mm',   step: 0.25,
      stops: [[0, 0, 0, 0, 0], [0.1, 120, 200, 255, 150], [1, 60, 120, 255, 210], [3, 170, 80, 255, 235], [8, 255, 60, 200, 255]] },
    { id: 'wind',   label: 'Viento',        key: 'wind_speed_10m',       unit: 'km/h', step: 5,
      stops: [[0, 30, 40, 110], [10, 60, 180, 200], [25, 170, 225, 60], [40, 250, 180, 40], [60, 230, 60, 50], [90, 200, 40, 200]] },
    { id: 'cloud',  label: 'Nubosidad',     key: 'cloud_cover',          unit: '%',    step: 10,
      stops: [[0, 0, 0, 0, 0], [100, 235, 235, 245, 235]] },
    { id: 'humid',  label: 'Humedad',       key: 'relative_humidity_2m', unit: '%',    step: 10,
      stops: [[0, 200, 120, 40], [50, 170, 225, 120], [75, 60, 180, 200], [100, 40, 60, 200]] },
    { id: 'press',  label: 'Presión',       key: 'pressure_msl',         unit: 'hPa',  step: 4,
      stops: [[980, 120, 60, 200], [1000, 60, 160, 230], [1013, 90, 220, 180], [1025, 240, 220, 80], [1040, 240, 90, 60]] },
    { id: 'snow',   label: 'Nieve',         key: 'snowfall',             unit: 'cm',   step: 0.1,
      stops: [[0, 0, 0, 0, 0], [0.1, 200, 230, 255, 190], [1, 255, 255, 255, 255]] },
    { id: 'uv',     label: 'Índice UV',     key: 'uv_index',             unit: '',     step: 1,
      stops: [[0, 40, 60, 100], [2, 80, 200, 100], [5, 250, 220, 40], [7, 250, 140, 30], [10, 230, 50, 50], [12, 200, 60, 200]] }
  ];
  const FIELD_KEYS = METRICS.map(m => m.key).concat('wind_direction_10m');

  const HOURLY = {};                                 // key -> [Float32Array(grid) por hora]
  let U, V, T0 = 0, TOFF = 0;                        // T0 = instante (ms) de la primera hora de los datos

  async function loadGrid() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && Date.now() - c.t < 3600e3) return c;
    } catch {}
    const pts = [];
    for (const la of LATS) for (let j = 0; j < NLON; j++) pts.push([la, -180 + j * STEP]);
    const chunks = [];
    for (let i = 0; i < pts.length; i += 66) chunks.push(pts.slice(i, i + 66));
    const out = [];
    for (const ch of chunks) {
      const q = new URLSearchParams({
        latitude: ch.map(p => p[0]).join(','), longitude: ch.map(p => p[1]).join(','),
        hourly: FIELD_KEYS.join(','), past_hours: 12, forecast_hours: 25, timezone: 'GMT'
      });
      const r = await fetch('https://api.open-meteo.com/v1/forecast?' + q);
      if (!r.ok) throw new Error('Open-Meteo ' + r.status + ', reintenta en un minuto');
      const d = await r.json();
      out.push(Array.isArray(d) ? d : [d]);
    }
    const flat = out.flat(), NH = flat[0].hourly.time.length;
    const g = { t: Date.now(), t0: Date.parse(flat[0].hourly.time[0] + 'Z'), f: {} };
    for (const k of FIELD_KEYS) {
      g.f[k] = Array.from({ length: NH }, (_, h) => flat.map(p => {
        const v = p.hourly[k]?.[h];
        return v == null ? 0 : Math.round(v * 10) / 10;
      }));
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(g)); } catch {}
    return g;
  }

  // Rejilla interpolada en el tiempo: 'off' = horas respecto a ahora (puede ser fraccionario)
  function interp(key, off) {
    const arrs = HOURLY[key], n = arrs.length;
    const h = Math.min(n - 1, Math.max(0, (Date.now() - T0) / 3600e3 + off));
    const i0 = Math.floor(h), i1 = Math.min(i0 + 1, n - 1), f = h - i0;
    const A = arrs[i0], B = arrs[i1], out = new Float32Array(A.length);
    for (let i = 0; i < A.length; i++) out[i] = A[i] * (1 - f) + B[i] * f;
    return out;
  }

  function sample(arr, lat, lon) {
    let fy = (Math.min(Math.max(lat, LATS[0]), LATS[LATS.length - 1]) - LATS[0]) / STEP;
    let fx = ((lon + 180) % 360 + 360) % 360 / STEP;
    const y0 = Math.min(Math.floor(fy), LATS.length - 2), x0 = Math.floor(fx) % NLON, x1 = (x0 + 1) % NLON;
    fy -= y0; fx -= Math.floor(fx);
    const a = arr[y0 * NLON + x0], b = arr[y0 * NLON + x1];
    const c = arr[(y0 + 1) * NLON + x0], d = arr[(y0 + 1) * NLON + x1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  function color(stops, t) {
    if (t <= stops[0][0]) return stops[0].slice(1);
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i], k = (t - a[0]) / (b[0] - a[0]);
        return [1, 2, 3, 4].map(j => (a[j] ?? 255) + ((b[j] ?? 255) - (a[j] ?? 255)) * k);
      }
    }
    return stops[stops.length - 1].slice(1);
  }

  const rowLat = (y, n) => 180 / Math.PI * (2 * Math.atan(Math.exp(Math.PI * (1 - 2 * (y + 0.5) / n))) - Math.PI / 2);

  function drawField(canvas, m) {
    const n = canvas.width, ctx = canvas.getContext('2d'), img = ctx.createImageData(n, n), arr = interp(m.key, TOFF);
    for (let y = 0; y < n; y++) {
      const lat = rowLat(y, n);
      for (let x = 0; x < n; x++) {
        const v = Math.round(sample(arr, lat, -180 + 360 * x / n) / m.step) * m.step;
        const c = color(m.stops, v), i = (y * n + x) * 4;
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = c[3] ?? 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function legendGradient(m) {
    const lo = m.stops[0][0], hi = m.stops[m.stops.length - 1][0];
    const parts = m.stops.map(s => `rgba(${s[1]},${s[2]},${s[3]},${(s[4] ?? 255) / 255}) ${((s[0] - lo) / (hi - lo) * 100).toFixed(0)}%`);
    return `linear-gradient(90deg, ${parts.join(',')})`;
  }

  function startWind(canvas) {
    const n = canvas.width, ctx = canvas.getContext('2d');
    const latTab = Array.from({ length: n }, (_, y) => rowLat(y, n));
    const cosTab = latTab.map(l => Math.max(Math.cos(l * Math.PI / 180), 0.2));
    const P = Array.from({ length: window.CLIMAPI?.windParticles || 5000 }, () => spawn({}));
    function spawn(p) { p.x = Math.random() * n; p.y = Math.random() * n; p.age = Math.random() * 80; return p; }

    function frame() {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.fillRect(0, 0, n, n);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const p of P) {
        const yi = Math.min(n - 1, Math.max(0, p.y | 0)), lat = latTab[yi], lon = -180 + 360 * p.x / n;
        const k = 0.03 / cosTab[yi];
        const nx = p.x + sample(U, lat, lon) * k, ny = p.y - sample(V, lat, lon) * k;
        if (p.age++ > 90 || ny < 0 || ny >= n) { spawn(p); p.age = 0; continue; }
        ctx.moveTo(p.x, p.y);
        if (Math.abs(nx - p.x) < n / 2) ctx.lineTo(nx, ny);
        p.x = (nx + n) % n; p.y = ny;
      }
      ctx.stroke();
      requestAnimationFrame(frame);
    }
    frame();
  }

  window.initWeatherLayers = async function (map) {
    const status = document.getElementById('layer-status');
    try {
      status.textContent = 'Cargando datos…';
      const g = await loadGrid();
      T0 = g.t0;
      for (const k of FIELD_KEYS) HOURLY[k] = g.f[k].map(arr => Float32Array.from(arr));
      // viento en componentes (u hacia el este, v hacia el norte) para cada hora
      HOURLY.U = HOURLY.wind_speed_10m.map((sp, h) => sp.map((v, i) => -v * Math.sin(HOURLY.wind_direction_10m[h][i] * Math.PI / 180)));
      HOURLY.V = HOURLY.wind_speed_10m.map((sp, h) => sp.map((v, i) => -v * Math.cos(HOURLY.wind_direction_10m[h][i] * Math.PI / 180)));
      U = interp('U', 0); V = interp('V', 0);

      const coords = [[-180, MAXLAT], [180, MAXLAT], [180, -MAXLAT], [-180, -MAXLAT]];
      const FIELD_HI = window.CLIMAPI?.fieldHi || 512, FIELD_LO = window.CLIMAPI?.fieldLo || 256;
      const fc = Object.assign(document.createElement('canvas'), { width: FIELD_HI, height: FIELD_HI });
      const wc = Object.assign(document.createElement('canvas'), { width: 1024, height: 1024 });
      drawField(fc, METRICS[0]);

      map.addSource('field', { type: 'image', url: fc.toDataURL('image/png'), coordinates: coords });
      map.addLayer({ id: 'field', type: 'raster', source: 'field', paint: { 'raster-opacity': window.satelliteOn ? 0.3 : 0.65, 'raster-fade-duration': 0 } }, 'clouds');

      // nubosidad -> densidad de las nubes animadas (se recalcula al mover la línea de tiempo)
      const CN = window.CLIMAPI?.cloudN || 256, cover = new Float32Array(CN * CN);   // mismo tamaño que las nubes (clouds.js)
      function updateCover() {
        const cc = interp('cloud_cover', TOFF);
        for (let y = 0; y < CN; y++) {
          const lat = rowLat(y, CN);
          for (let x = 0; x < CN; x++) cover[y * CN + x] = sample(cc, lat, -180 + 360 * (x + 0.5) / CN) / 100;
        }
        window.setCloudCover?.(cover);
      }
      updateCover();
      map.addSource('wind', { type: 'canvas', canvas: wc, coordinates: coords, animate: true });
      map.addLayer({ id: 'wind', type: 'raster', source: 'wind', paint: { 'raster-fade-duration': 0 } }, 'borders-casing');
      startWind(wc);

      // --- UI: selector de capa, leyenda y partículas ---
      const box = document.getElementById('metrics'), bar = document.getElementById('legend-bar');
      const lo = document.getElementById('legend-lo'), hi = document.getElementById('legend-hi');
      const title = document.getElementById('metric-title'), lname = document.getElementById('legend-name');
      let active = METRICS[0];
      function select(m) {
        active = m;
        fc.width = fc.height = FIELD_HI;
        drawField(fc, m);
        map.getSource('field').updateImage({ url: fc.toDataURL('image/png'), coordinates: coords });
        bar.style.background = legendGradient(m);
        lo.textContent = m.stops[0][0] + ' ' + m.unit;
        hi.textContent = m.stops[m.stops.length - 1][0] + ' ' + m.unit;
        title.textContent = lname.textContent = m.label;
        document.getElementById('rail-metric').innerHTML = PX.html(m.id);
      }
      box.innerHTML = '';
      METRICS.forEach((m, i) => {
        const l = document.createElement('label');
        l.className = 'tog';
        l.title = m.label;
        l.innerHTML = `<input type="radio" name="metric" ${i === 0 ? 'checked' : ''}><span class="ic">${PX.html(m.id)}</span>`;
        l.querySelector('input').onchange = () => select(m);
        // al pasar el ratón, el título muestra el nombre sin cambiar la selección
        l.onmouseenter = () => { title.textContent = m.label; };
        l.onmouseleave = () => { title.textContent = active.label; };
        box.appendChild(l);
      });
      select(METRICS[0]);

      // para guardar/restaurar la vista desde un enlace (share.js)
      window.climapi = {
        activeMetric: () => active.id,
        selectMetric: id => {
          const i = METRICS.findIndex(m => m.id === id);
          if (i < 0) return;
          box.querySelectorAll('input')[i].checked = true;
          select(METRICS[i]);
        }
      };

      // Línea de tiempo: low = true mientras se arrastra (renderiza a menor resolución para ir fluido)
      window.setTimelineHours = (off, low) => {
        TOFF = off;
        U = interp('U', off); V = interp('V', off);
        fc.width = fc.height = low ? FIELD_LO : FIELD_HI;
        drawField(fc, active);
        map.getSource('field').updateImage({ url: fc.toDataURL('image/png'), coordinates: coords });
        updateCover();
      };

      const fcb = document.getElementById('toggle-field');
      fcb.disabled = false;
      fcb.onchange = () => map.setLayoutProperty('field', 'visibility', fcb.checked ? 'visible' : 'none');

      const wcb = document.getElementById('toggle-wind');
      wcb.disabled = false;
      wcb.onchange = () => map.setLayoutProperty('wind', 'visibility', wcb.checked ? 'visible' : 'none');
      status.textContent = '';
    } catch (e) {
      status.textContent = 'No se pudieron cargar los datos (' + e.message + ')';
    }
  };
})();
