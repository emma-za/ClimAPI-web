// Iluminación solar en tiempo real: sombra nocturna con crepúsculo + luces de ciudades en el lado oscuro.
(() => {
  const RAD = Math.PI / 180;
  const MAXLAT = 85.0511;

  // Posición del sol (aprox. astronómica): latitud y longitud del punto subsolar
  function subsolar(date = new Date()) {
    const d = date / 86400000 + 2440587.5 - 2451545.0;
    const g = (357.529 + 0.98560028 * d) * RAD;
    const q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
    const e = (23.439 - 0.00000036 * d) * RAD;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) * 15;          // grados
    let lon = ra / RAD - gmst;
    lon = ((lon + 540) % 360) - 180;
    return { lat: dec / RAD, lon };
  }

  const rowLat = (y, n) => 180 / Math.PI * (2 * Math.atan(Math.exp(Math.PI * (1 - 2 * (y + 0.5) / n))) - Math.PI / 2);

  function draw(canvas, date = new Date()) {
    const n = canvas.width, ctx = canvas.getContext('2d'), img = ctx.createImageData(n, n);
    const sun = subsolar(date), sinD = Math.sin(sun.lat * RAD), cosD = Math.cos(sun.lat * RAD);
    const cosH = new Float32Array(n);
    for (let x = 0; x < n; x++) cosH[x] = Math.cos((-180 + 360 * (x + 0.5) / n - sun.lon) * RAD);

    // oscuridad 0..1 a partir del seno de la elevación solar (crepúsculo suave, cuantizado a 6 niveles = look pixel)
    const dark = s => Math.round(Math.min(1, Math.max(0, (0.06 - s) / 0.24)) * 6) / 6;

    for (let y = 0; y < n; y++) {
      const lat = rowLat(y, n) * RAD, a = Math.sin(lat) * sinD, b = Math.cos(lat) * cosD;
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4;
        img.data[i] = 3; img.data[i + 1] = 5; img.data[i + 2] = 18;
        img.data[i + 3] = dark(a + b * cosH[x]) * 165;
      }
    }
    ctx.putImageData(img, 0, 0);

    // luces de ciudades (solo donde es de noche); el tamaño escala con la resolución del canvas
    const sc = n / 1024;
    for (const c of CITIES) {
      const s = Math.sin(c.lat * RAD) * sinD + Math.cos(c.lat * RAD) * cosD * Math.cos((c.lon - sun.lon) * RAD);
      const k = dark(s);
      if (k < 0.3) continue;
      const px = Math.round((c.lon + 180) / 360 * n);
      const py = Math.round(n * (0.5 - Math.log(Math.tan(Math.PI / 4 + c.lat * RAD / 2)) / (2 * Math.PI)));
      if (c.w >= 2) { const h = Math.max(1, Math.round(3 * sc)); ctx.fillStyle = `rgba(255,190,90,${0.22 * k})`; ctx.fillRect(px - h, py - h, h * 2, h * 2); }
      ctx.fillStyle = `rgba(255,${c.w === 3 ? 235 : 215},140,${k})`;
      const size = Math.max(1, Math.round((c.w === 1 ? 1 : c.w) * sc));
      ctx.fillRect(px - (size >> 1), py - (size >> 1), size, size);
    }
  }

  window.initDayNight = function (map) {
    const canvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 1024 });
    const lowCanvas = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });   // para arrastrar la línea de tiempo
    const coords = [[-180, MAXLAT], [180, MAXLAT], [180, -MAXLAT], [-180, -MAXLAT]];
    draw(canvas);
    map.addSource('night', { type: 'image', url: canvas.toDataURL('image/png'), coordinates: coords });
    map.addLayer({ id: 'night', type: 'raster', source: 'night', paint: { 'raster-fade-duration': 0 } });

    const render = (date, low) => {
      const cv = low ? lowCanvas : canvas;
      draw(cv, date);
      map.getSource('night')?.updateImage({ url: cv.toDataURL('image/png'), coordinates: coords });
    };
    window.setDayNightTime = render;
    // actualización en vivo cada minuto, solo cuando la línea de tiempo está en "ahora"
    setInterval(() => { if (!window.timelineOffset) render(new Date(), false); }, 60000);

    const cb = document.getElementById('toggle-night');
    cb.disabled = false;
    cb.onchange = () => map.setLayoutProperty('night', 'visibility', cb.checked ? 'visible' : 'none');
  };
})();
