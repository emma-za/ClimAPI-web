// Nubes animadas: ruido fractal 3D sobre la esfera (sin costuras ni deformación en los polos).
// Cada octava gira a distinta velocidad, así las nubes se desplazan y cambian de forma.
// La densidad sigue la nubosidad real (Open-Meteo) cuando los datos están disponibles.
(() => {
  const DEV = window.CLIMAPI || {};
  const N = DEV.cloudN || 256;         // resolución del canvas (Mercator); weather.js debe usar el mismo valor
  const FPS = DEV.cloudFps || 10;
  const MAXLAT = 85.0511;
  const RAD = Math.PI / 180;
  const OCT = [                        // [frecuencia, peso, velocidad angular rad/s]
    [3.6, 0.55, 0.020],
    [8.0, 0.30, 0.032],
    [17.0, 0.15, -0.014]
  ];

  const hash = (x, y, z) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = t => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  function noise3(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = sm(x - ix), fy = sm(y - iy), fz = sm(z - iz);
    return lerp(
      lerp(lerp(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx), lerp(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx), fy),
      lerp(lerp(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx), lerp(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx), fy),
      fz);
  }

  // Punto de la esfera para cada píxel (fila = latitud Mercator, columna = longitud)
  const bx = new Float32Array(N * N), by = new Float32Array(N * N), bz = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    const lat = 2 * Math.atan(Math.exp(Math.PI * (1 - 2 * (y + 0.5) / N))) - Math.PI / 2;
    for (let x = 0; x < N; x++) {
      const lon = (-180 + 360 * (x + 0.5) / N) * RAD, i = y * N + x;
      bx[i] = Math.cos(lat) * Math.cos(lon); by[i] = Math.sin(lat); bz[i] = Math.cos(lat) * Math.sin(lon);
    }
  }

  let cover = null;                    // Float32Array N*N con 0..1, o null = cobertura media uniforme
  window.setCloudCover = arr => { cover = arr; };

  window.initClouds = function (map) {
    const canvas = Object.assign(document.createElement('canvas'), { width: N, height: N });
    const ctx = canvas.getContext('2d'), img = ctx.createImageData(N, N);
    const coords = [[-180, MAXLAT], [180, MAXLAT], [180, -MAXLAT], [-180, -MAXLAT]];

    map.addSource('clouds', { type: 'canvas', canvas, coordinates: coords, animate: true });
    map.addLayer({
      id: 'clouds', type: 'raster', source: 'clouds',
      paint: { 'raster-fade-duration': 0, 'raster-opacity': 0.85 }
    }, 'night');

    const cb = document.getElementById('toggle-clouds');
    cb.disabled = false;
    cb.onchange = () => map.setLayoutProperty('clouds', 'visibility', cb.checked ? 'visible' : 'none');

    let last = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      if (now - last < 1000 / FPS || cb.checked === false) return;
      last = now;
      const t = now / 1000;
      const cs = OCT.map(o => [Math.cos(o[2] * t), Math.sin(o[2] * t)]);
      const d = img.data;
      for (let i = 0; i < N * N; i++) {
        let n = 0;
        for (let k = 0; k < OCT.length; k++) {
          const c = cs[k][0], s = cs[k][1], f = OCT[k][0];
          // rotación alrededor del eje polar (deriva en longitud) + desplazamiento en el tiempo
          n += OCT[k][1] * noise3((bx[i] * c - bz[i] * s) * f + 11 * k, by[i] * f, (bx[i] * s + bz[i] * c) * f);
        }
        const c = cover ? cover[i] : 0.5;
        // umbral: más cobertura -> más nubes; suavizado y cuantizado a 5 niveles (look pixel)
        const th = 0.88 - 0.5 * c;
        let a = Math.min(1, Math.max(0, (n - th) / 0.14));
        a = Math.round(a * 5) / 5;
        const j = i * 4;
        d[j] = 246; d[j + 1] = 249; d[j + 2] = 255; d[j + 3] = a * 200;
      }
      ctx.putImageData(img, 0, 0);
    }
    requestAnimationFrame(frame);
  };
})();
