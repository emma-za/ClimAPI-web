// Códigos WMO de Open-Meteo -> [emoji, descripción]
const WMO = {
  0: ['☀️', 'Despejado'], 1: ['🌤️', 'Mayormente despejado'], 2: ['⛅', 'Parcialmente nublado'], 3: ['☁️', 'Nublado'],
  45: ['🌫️', 'Niebla'], 48: ['🌫️', 'Niebla con escarcha'],
  51: ['🌦️', 'Llovizna ligera'], 53: ['🌦️', 'Llovizna'], 55: ['🌧️', 'Llovizna intensa'],
  56: ['🌧️', 'Llovizna helada'], 57: ['🌧️', 'Llovizna helada intensa'],
  61: ['🌧️', 'Lluvia ligera'], 63: ['🌧️', 'Lluvia'], 65: ['🌧️', 'Lluvia intensa'],
  66: ['🌧️', 'Lluvia helada'], 67: ['🌧️', 'Lluvia helada intensa'],
  71: ['🌨️', 'Nieve ligera'], 73: ['🌨️', 'Nieve'], 75: ['❄️', 'Nieve intensa'], 77: ['❄️', 'Granos de nieve'],
  80: ['🌦️', 'Chubascos ligeros'], 81: ['🌧️', 'Chubascos'], 82: ['⛈️', 'Chubascos violentos'],
  85: ['🌨️', 'Chubascos de nieve'], 86: ['🌨️', 'Chubascos de nieve intensos'],
  95: ['⛈️', 'Tormenta'], 96: ['⛈️', 'Tormenta con granizo'], 99: ['⛈️', 'Tormenta con granizo fuerte']
};
const wmo = c => WMO[c] || ['❔', 'Desconocido'];

// Zoom inicial: en pantallas pequeñas el globo debe caber entero (su tamaño depende solo del zoom, no de la ventana)
function initialZoom() {
  if (innerWidth > 1000 && innerHeight > 520) return 1.6;
  const side = Math.min(innerWidth, innerHeight * 0.62);               // espacio útil aproximado para el globo
  return Math.min(1.6, Math.max(0.6, Math.log2(side * 0.005717)));     // diámetro del globo ≈ 82 % de ese espacio
}

const map = new maplibregl.Map({
  container: 'map',
  center: window.__view?.center || [-40, 20],     // un enlace compartido puede traer su propia cámara (ver share.js)
  zoom: window.__view?.zoom ?? initialZoom(),
  attributionControl: { compact: true },
  ...(window.CLIMAPI?.pixelRatio ? { pixelRatio: window.CLIMAPI.pixelRatio } : {}),   // en móviles de alta densidad, tope de 2×
  canvasContextAttributes: { preserveDrawingBuffer: true },     // permite capturar el globo para la postal compartible
  style: {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',   // fuentes para los nombres
    sources: {
      shade: {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-180, -85], [0, -85], [180, -85], [180, 0], [180, 85], [0, 85], [-180, 85], [-180, 0], [-180, -85]]] } }
      },
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Clima: <a href="https://open-meteo.com">Open-Meteo</a> · Iconos: <a href="https://pixeliconlibrary.com">Pixel Icon Library</a> by HackerNoon'
      }
    },
    layers: [
      { id: 'osm', type: 'raster', source: 'osm' },
      // sombra negra para oscurecer el mapa base
      { id: 'shade', type: 'fill', source: 'shade', paint: { 'fill-color': '#05050a', 'fill-opacity': 0.55, 'fill-antialias': false } }
    ]
  }
});

map.on('style.load', () => {
  map.setProjection({ type: 'globe' });
  initDayNight(map);          // capa 'night' (queda por encima del mapa base)
  initClouds(map);
  initSatellite(map);         // imágenes reales NASA GIBS (apagadas por defecto), justo debajo del mapa de color            // 'clouds' justo debajo de 'night'; el mapa de color queda debajo de las nubes
  initBorders(map);         // 'borders' por encima de todo el color
  initStorms(map);
  initExplore(map);           // eventos del planeta (NASA EONET + récords del día)            // tormentas: por debajo de los nombres, por encima de fronteras y datos
  initWeatherLayers(map);     // inserta 'field' antes de 'night' y 'wind' antes de 'borders'
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
map.addControl(new maplibregl.GlobeControl(), 'bottom-right');

const panel = document.getElementById('panel');
const body = document.getElementById('panel-body');
let marker = null;

document.getElementById('close').onclick = () => {
  panel.hidden = true; marker?.remove(); marker = null;
  window.lastWeatherPoint = null; window.shareTouch?.();
};

map.on('click', e => {
  if (window.stormHit?.(e)) return;          // clic en una tormenta: tarjeta de la tormenta
  showWeather(e.lngLat.wrap().lng, e.lngLat.wrap().lat);
});

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Icono pixel según el código WMO (día/noche)
function wxIcon(code, isDay = 1) {
  if (code <= 1) return isDay ? 'uv' : 'night';
  if (code <= 3) return 'clouds';
  if (code <= 48) return 'cloud';
  if (code <= 67 || (code >= 80 && code <= 82)) return 'precip';
  if (code <= 77 || code === 85 || code === 86) return 'snow';
  return 'storm';
}

// Inserta una alerta compacta justo debajo de la cabecera del panel (tormentas cercanas, evento seleccionado…)
window.panelAlert = html => body.querySelector('.ph')?.insertAdjacentHTML('afterend', html);

async function showWeather(lon, lat, name) {
  document.getElementById('hint').hidden = true;
  marker?.remove();
  marker = new maplibregl.Marker({ color: '#7dffb3' }).setLngLat([lon, lat]).addTo(map);
  panel.hidden = false;
  panel.classList.remove('collapsed');            // en móvil, cada consulta nueva abre la hoja completa
  body.innerHTML = '<p>Cargando…</p>';
  const reqId = window.__wxReq = (window.__wxReq || 0) + 1;      // identifica esta consulta (las respuestas tardías se descartan)

  const url ='https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'auto',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,pressure_msl,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,sunrise,sunset',
    hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,pressure_msl,is_day',
    past_hours: 12, forecast_hours: 25, forecast_days: 5
  });

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    const u = d.current_units;
    // hora elegida en la línea de tiempo (0 = ahora): se usa el dato horario correspondiente
    const off = Math.round(window.timelineOffset || 0);
    let c = d.current;
    if (off !== 0) {
      const idx = Math.min(d.hourly.time.length - 1, Math.max(0, 12 + off));
      c = { time: d.hourly.time[idx] };
      for (const k of Object.keys(d.hourly)) if (k !== 'time') c[k] = d.hourly[k][idx];
    }
    window.lastWeatherPoint = { lon, lat, name };
    window.shareTouch?.();                         // actualiza el enlace compartible con este lugar
    const desc = wmo(c.weather_code)[1];
    const near = name ? null : nearestCity(lat, lon);
    const label = name || near?.name || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;

    // próximo evento solar (las horas de Open-Meteo vienen en la zona horaria del lugar)
    const fmtDur = min => min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
    const now = new Date(c.time), sr = d.daily.sunrise, ss = d.daily.sunset;
    let sun;
    const ev = [];
    d.daily.sunrise.forEach((t, i) => { if (t && d.daily.sunset[i]) { ev.push([new Date(t), 'rise']); ev.push([new Date(d.daily.sunset[i]), 'set']); } });
    ev.sort((p, q) => p[0] - q[0]);
    const nx = ev.find(e => e[0] > now);
    if (nx) {
      const m = Math.round((nx[0] - now) / 60000);
      sun = nx[1] === 'rise' ? ['night', `Amanece en ${fmtDur(m)}`] : ['uv', `Atardece en ${fmtDur(m)}`];
    } else sun = ['uv', 'Sol de medianoche / noche polar'];

    const fc = d.daily.time.map((t, i) => {
      const dn = new Date(t + 'T12:00').toLocaleDateString('es', { weekday: 'short' });
      return `<div title="${Math.round(d.daily.precipitation_sum[i])} mm"><small>${dn}</small>${PX.html(wxIcon(d.daily.weather_code[i]))}
        <b>${Math.round(d.daily.temperature_2m_max[i])}°</b><small>${Math.round(d.daily.temperature_2m_min[i])}°</small></div>`;
    }).join('');

    // resumen del lugar para otros módulos (p. ej. la postal compartible)
    window.lastWeatherData = {
      reqId, label, lat, lon, off, tz: d.timezone, time: c.time, desc, sun: sun[1],
      temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), icon: wxIcon(c.weather_code, c.is_day),
      humidity: c.relative_humidity_2m, wind: Math.round(c.wind_speed_10m), pressure: Math.round(c.pressure_msl), precip: c.precipitation,
      units: { wind: u.wind_speed_10m, pressure: u.pressure_msl, precip: u.precipitation },
      forecast: d.daily.time.map((t, i) => ({
        day: new Date(t + 'T12:00').toLocaleDateString('es', { weekday: 'short' }), icon: wxIcon(d.daily.weather_code[i]),
        max: Math.round(d.daily.temperature_2m_max[i]), min: Math.round(d.daily.temperature_2m_min[i])
      }))
    };

    body.innerHTML = `
      <header class="ph">
        <div><h2 class="place">${esc(label)}</h2><span class="ph-sub">${lat.toFixed(2)}, ${lon.toFixed(2)} · ${esc(d.timezone.split('/').pop().replace('_', ' '))}</span></div>
        <div class="ph-clock" title="Hora local">${c.time.slice(11, 16)}${off ? `<small>${off > 0 ? '+' : ''}${off} h</small>` : ''}</div>
      </header>
      <section class="hero">
        ${PX.html(wxIcon(c.weather_code, c.is_day))}
        <div class="temp">${Math.round(c.temperature_2m)}${u.temperature_2m}</div>
        <div class="hero-side"><b>${desc}</b><small>Sensación ${Math.round(c.apparent_temperature)}${u.apparent_temperature}</small></div>
      </section>
      <div class="chip">${PX.html(sun[0])}<span>${sun[1]}</span></div>
      <section class="anom" id="anom"><small>Comparando con el histórico…</small></section>
      <section class="metrics">
        <div title="Humedad">${PX.html('humid')}<span>${c.relative_humidity_2m}${u.relative_humidity_2m}</span></div>
        <div title="Viento">${PX.html('wind')}<span>${Math.round(c.wind_speed_10m)} <small>${u.wind_speed_10m}</small></span></div>
        <div title="Presión">${PX.html('press')}<span>${Math.round(c.pressure_msl)} <small>${u.pressure_msl}</small></span></div>
        <div title="Precipitación">${PX.html('precip')}<span>${c.precipitation} <small>${u.precipitation}</small></span></div>
      </section>
      <section class="fc">${fc}</section>`;
    const storm = window.stormApproachHTML?.(lat, lon, d.timezone);   // tormentas cercanas (una sola línea, desplegable)
    if (storm) window.panelAlert(storm);
    window.climapiAnomaly?.render({ lat, lon, daily: d.daily, dateISO: c.time.slice(0, 10), reqId });   // "¿es normal?" (asíncrono)
  } catch (err) {
    body.innerHTML = '<p>No se pudo obtener el clima. Inténtalo de nuevo.</p>';
  }
}

// Si el clic cae en el nombre de un lugar, lo resolvemos al buscar; al hacer clic solo mostramos coordenadas.

// --- Búsqueda de ciudades (Open-Meteo Geocoding) ---
const form = document.getElementById('search');
const input = document.getElementById('q');
const results = document.getElementById('results');

form.addEventListener('submit', async e => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;
  const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?' + new URLSearchParams({ name: q, count: 5, language: 'es' }));
  const d = await r.json();
  results.innerHTML = '';
  if (!d.results?.length) {
    results.innerHTML = '<li>Sin resultados</li>';
  } else {
    for (const p of d.results) {
      const li = document.createElement('li');
      li.innerHTML = `${p.name} <small>${[p.admin1, p.country].filter(Boolean).join(', ')}</small>`;
      li.onclick = () => {
        results.hidden = true;
        map.flyTo({ center: [p.longitude, p.latitude], zoom: 6, essential: true });
        showWeather(p.longitude, p.latitude, p.name);
      };
      results.appendChild(li);
    }
  }
  results.hidden = false;
});
document.addEventListener('click', e => { if (!form.contains(e.target)) results.hidden = true; });

// Al soltar la línea de tiempo, el panel abierto se actualiza a esa hora
window.refreshPanelWeather = () => {
  const p = window.lastWeatherPoint;
  if (p && !panel.hidden) showWeather(p.lon, p.lat, p.name);
};
