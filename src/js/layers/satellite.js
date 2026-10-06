// Imágenes de satélite reales (NASA GIBS, https://earthdata.nasa.gov/gibs):
//  - base global: mosaico diario VIIRS en color real (cubre todo el planeta, del día anterior)
//  - encima, geoestacionarias casi en tiempo real (cada 10 min): GOES-Este y GOES-Oeste (color real, también de noche)
//    y Himawari (infrarrojo) para Asia-Pacífico.
// La línea de tiempo pide la imagen de esa hora (hasta 12 h atrás). No hay imágenes del futuro: se muestra la última.
(() => {
  const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
  const LAYERS = [
    { id: 'sat-viirs',    name: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', tms: 'GoogleMapsCompatible_Level9', ext: 'jpeg', maxzoom: 9, geo: false },
    { id: 'sat-himawari', name: 'Himawari_AHI_Band13_Clean_Infrared',        tms: 'GoogleMapsCompatible_Level6', ext: 'png',  maxzoom: 6, geo: true, opacity: 0.75 },
    { id: 'sat-goes-w',   name: 'GOES-West_ABI_GeoColor',                    tms: 'GoogleMapsCompatible_Level7', ext: 'png',  maxzoom: 7, geo: true },
    { id: 'sat-goes-e',   name: 'GOES-East_ABI_GeoColor',                    tms: 'GoogleMapsCompatible_Level7', ext: 'png',  maxzoom: 7, geo: true }
  ];

  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00Z`;
  const url = (L, time) => `${GIBS}/${L.name}/default/${time}/${L.tms}/{z}/{y}/{x}.${L.ext}`;

  let map, enabled = false, lastTime = 'default', cloudsWereOn = false;
  window.satelliteOn = false;

  function note() {
    const el = document.getElementById('sat-note');
    if (!enabled) { el.textContent = ''; return; }
    const off = window.timelineOffset || 0;
    el.textContent = off < 0
      ? 'Satélite NASA · ' + new Date(Date.now() + off * 3600e3).toLocaleString('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
      : off > 0 ? 'Satélite NASA · sin imagen futura (última)' : 'Satélite NASA · última imagen';
  }

  // Hora de la línea de tiempo -> imagen geoestacionaria (pasos de 10 min). Futuro o ahora: la última ('default').
  window.setSatelliteTime = off => {
    if (!map) return;
    const time = off < 0 ? iso(new Date(Math.floor((Date.now() + off * 3600e3) / 600e3) * 600e3)) : 'default';
    if (time !== lastTime) {
      lastTime = time;
      LAYERS.filter(L => L.geo).forEach(L => map.getSource(L.id)?.setTiles([url(L, time)]));
    }
    note();
  };

  function set(on) {
    enabled = window.satelliteOn = on;
    LAYERS.forEach(L => map.setLayoutProperty(L.id, 'visibility', on ? 'visible' : 'none'));
    // el satélite sustituye al mapa base oscuro y a las nubes procedurales
    ['osm', 'shade'].forEach(id => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'none' : 'visible'));
    if (map.getLayer('field')) map.setPaintProperty('field', 'raster-opacity', on ? 0.3 : 0.65);
    const cl = document.getElementById('toggle-clouds');
    if (on) { cloudsWereOn = cl.checked; if (cl.checked) { cl.checked = false; cl.onchange?.(); } }
    else if (cloudsWereOn && !cl.checked) { cl.checked = true; cl.onchange?.(); }
    window.setSatelliteTime(window.timelineOffset || 0);
    note();
  }

  window.initSatellite = function (m) {
    map = m;
    LAYERS.forEach((L, i) => {
      map.addSource(L.id, { type: 'raster', tiles: [url(L, 'default')], tileSize: 256, maxzoom: L.maxzoom, ...(i === 0 ? { attribution: 'Imágenes: NASA GIBS' } : {}) });
      map.addLayer({
        id: L.id, type: 'raster', source: L.id, layout: { visibility: 'none' },
        paint: { 'raster-fade-duration': 0, 'raster-opacity': L.opacity ?? 1 }
      }, 'clouds');
    });
    const cb = document.getElementById('toggle-sat');
    cb.onchange = () => set(cb.checked);

    // Botón "Solo satélite": satélite encendido, sin mapa de datos ni sombra de noche; al repetir, restaura lo anterior
    const btn = document.getElementById('sat-view'), $ = id => document.getElementById(id);
    const IDS = ['toggle-sat', 'toggle-field', 'toggle-night'];
    let saved = null;
    const setCb = (id, v) => { const c = $(id); if (c.checked !== v) { c.checked = v; c.dispatchEvent(new Event('change', { bubbles: true })); } };
    btn.onclick = () => {
      if ($('toggle-field').disabled || $('toggle-night').disabled) return;        // los datos aún están cargando
      if (!saved) {
        saved = Object.fromEntries(IDS.map(id => [id, $(id).checked]));
        setCb('toggle-sat', true); setCb('toggle-field', false); setCb('toggle-night', false);
      } else {
        IDS.forEach(id => setCb(id, saved[id]));
        saved = null;
      }
      btn.classList.toggle('on', !!saved);
      btn.querySelector('span').textContent = saved ? 'Salir de solo satélite' : 'Solo satélite';
    };
  };
})();
