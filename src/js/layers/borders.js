// Fronteras y nombres: contornos de países (Natural Earth), nombres de países y de ciudades principales.
// Todo va por encima de los datos de clima; los textos llevan halo oscuro para leerse sobre cualquier color.
(() => {
  const BASE = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/';
  const FONT = ['Noto Sans Regular'];
  const empty = { type: 'FeatureCollection', features: [] };

  // Puntos de etiqueta a partir de los polígonos (usa la posición sugerida por Natural Earth)
  const labelPoints = fc => ({
    type: 'FeatureCollection',
    features: fc.features.filter(f => f.properties.LABEL_X != null).map(f => ({
      type: 'Feature',
      properties: { name: f.properties.NAME_ES || f.properties.NAME, min: f.properties.MIN_LABEL ?? 5 },
      geometry: { type: 'Point', coordinates: [f.properties.LABEL_X, f.properties.LABEL_Y] }
    }))
  });

  window.initBorders = async function (map) {
    const line = (id, color, opacity, w1, w5) => map.addLayer({
      id, type: 'line', source: 'countries', layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': color, 'line-opacity': opacity, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, w1, 5, w5] }
    });
    map.addSource('countries', { type: 'geojson', data: empty });
    map.addSource('country-labels', { type: 'geojson', data: empty });
    line('borders-casing', '#000000', 0.75, 2.6, 4);                 // contorno oscuro debajo
    line('borders', '#f2f2f2', 0.95, 1, 1.8);                        // línea clara encima

    // Ciudades principales (lista de daynight.js), más pequeñas y en verde menta
    map.addSource('city-labels', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: CITIES.map(c => ({ type: 'Feature', properties: { name: c.name, w: c.w }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } }))
      }
    });
    const city = (id, w, minzoom) => {
      map.addLayer({
        id: id + '-dot', type: 'circle', source: 'city-labels', filter: ['==', ['get', 'w'], w], minzoom,
        paint: { 'circle-radius': 2.5, 'circle-color': '#7dffb3', 'circle-stroke-color': '#000000', 'circle-stroke-width': 1 }
      });
      map.addLayer({
        id, type: 'symbol', source: 'city-labels', filter: ['==', ['get', 'w'], w], minzoom,
        layout: {
          'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 14],
          'text-anchor': 'top', 'text-offset': [0, 0.6], 'text-max-width': 8, 'text-padding': 2
        },
        paint: { 'text-color': '#7dffb3', 'text-halo-color': '#05050a', 'text-halo-width': 2 }
      });
    };
    city('cities-3', 3, 2.2);
    city('cities-2', 2, 3.4);
    city('cities-1', 1, 4.4);

    // Nombres de países, por niveles de importancia (MIN_LABEL) para no saturar el globo
    const country = (id, filter, minzoom) => map.addLayer({
      id, type: 'symbol', source: 'country-labels', filter, minzoom,
      layout: {
        'text-field': ['get', 'name'], 'text-font': FONT, 'text-transform': 'uppercase',
        'text-size': ['interpolate', ['linear'], ['zoom'], 1, 9, 5, 15],
        'text-letter-spacing': 0.08, 'text-max-width': 6, 'text-padding': 3
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#05050a', 'text-halo-width': 2, 'text-halo-blur': 0 }
    });
    country('country-names-1', ['<=', ['get', 'min'], 2], 1);
    country('country-names-2', ['all', ['>', ['get', 'min'], 2], ['<=', ['get', 'min'], 4]], 2.6);
    country('country-names-3', ['>', ['get', 'min'], 4], 4);

    // --- casillas del menú ---
    const toggle = (cbId, ids) => {
      const cb = document.getElementById(cbId);
      cb.onchange = () => ids.forEach(id => map.setLayoutProperty(id, 'visibility', cb.checked ? 'visible' : 'none'));
    };
    toggle('toggle-borders', ['borders-casing', 'borders']);
    toggle('toggle-names', ['country-names-1', 'country-names-2', 'country-names-3',
                            'cities-3', 'cities-3-dot', 'cities-2', 'cities-2-dot', 'cities-1', 'cities-1-dot']);

    // --- datos: versión ligera enseguida y la detallada (50m) en segundo plano ---
    const load = async file => {
      const r = await fetch(BASE + file);
      if (!r.ok) throw new Error(r.status);
      const fc = await r.json();
      map.getSource('countries')?.setData(fc);
      map.getSource('country-labels')?.setData(labelPoints(fc));
    };
    try { await load('ne_110m_admin_0_countries.geojson'); } catch { /* sin fronteras, el resto funciona */ }
    try { await load('ne_50m_admin_0_countries.geojson'); } catch { /* se mantiene el 110m */ }
  };
})();
