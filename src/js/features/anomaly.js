// Anomalía de temperatura: "¿es normal?".
// Compara la temperatura media prevista de cada día con la de las mismas fechas (±3 días) de los últimos 10 años
// (reanálisis ERA5, vía Open-Meteo Archive). Una petición corta por año (~11 días) para gastar pocas llamadas.
(() => {
  const YEARS = 10;                       // años de referencia
  const HALF = 3;                         // ventana de ±3 días alrededor de cada fecha
  const MIN_SD = 0.5;                     // desviación mínima (°C): evita exagerar en climas muy estables
  const DAY = 86400000;
  const $ = id => document.getElementById(id);

  const utc = s => Date.parse(s + 'T00:00:00Z');
  const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
  // misma fecha, k años antes
  const back = (ms, k) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear() - k, d.getUTCMonth(), d.getUTCDate()); };

  const cache = new Map();                // "lat,lon,fecha" -> Promise<[{k, t:[ms], v:[°C]}]>

  function loadSeries(lat, lon, firstDay, lastDay) {
    const key = `${lat.toFixed(1)},${lon.toFixed(1)},${firstDay},${lastDay}`;
    if (!cache.has(key)) {
      const a = utc(firstDay) - HALF * DAY, b = utc(lastDay) + HALF * DAY;
      const jobs = Array.from({ length: YEARS }, async (_, i) => {
        const k = i + 1;
        const q = new URLSearchParams({
          latitude: lat.toFixed(3), longitude: lon.toFixed(3), timezone: 'auto',
          start_date: isoDay(back(a, k)), end_date: isoDay(back(b, k)), daily: 'temperature_2m_mean'
        });
        const r = await fetch('https://archive-api.open-meteo.com/v1/archive?' + q);
        if (!r.ok) throw new Error(r.status);
        const d = await r.json();
        return { k, t: d.daily.time.map(utc), v: d.daily.temperature_2m_mean };
      });
      cache.set(key, Promise.allSettled(jobs).then(rs => {
        const ok = rs.filter(r => r.status === 'fulfilled').map(r => r.value);
        if (ok.length < 5) { cache.delete(key); throw new Error('histórico incompleto'); }   // no cachear fallos (p. ej. 429)
        return ok;
      }));
    }
    return cache.get(key);
  }

  // Estadística de un día: media histórica, desviación, z y porcentaje de años que fueron más fríos
  function stats(years, dayMs, x) {
    if (x == null) return null;
    const vals = [];
    for (const y of years) {
      const base = back(dayMs, y.k);
      y.t.forEach((t, j) => { if (Math.abs(t - base) <= HALF * DAY && y.v[j] != null) vals.push(y.v[j]); });
    }
    if (vals.length < 20) return null;
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sd = Math.max(MIN_SD, Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1)));
    return { mean, sd, delta: x - mean, z: (x - mean) / sd, below: vals.filter(v => v < x).length / vals.length, n: vals.length };
  }

  // Escala de color en 5 tramos (look pixel): frío extremo … calor extremo
  const COLORS = ['#5a6bff', '#7aa2ff', '#9a9ab0', '#ffb347', '#ff4d4d'];
  const bin = z => (z <= -2 ? 0 : z < -0.7 ? 1 : z <= 0.7 ? 2 : z < 2 ? 3 : 4);
  const colorOf = z => COLORS[bin(z)];
  const fmtDelta = d => `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} °C`;

  function wording(s) {
    const a = Math.abs(s.z), w = s.z > 0 ? 'cálido' : 'frío';
    const head = a < 0.7 ? 'Dentro de lo normal' : a < 1.5 ? `Algo más ${w} de lo normal` : a < 2.2 ? `Mucho más ${w} de lo normal` : `Excepcionalmente ${w}`;
    const share = Math.round((s.delta >= 0 ? s.below : 1 - s.below) * 100);
    const note = a < 0.7
      ? `Media histórica ${s.mean.toFixed(1)} °C`
      : share >= 100 ? `Récord de los últimos ${YEARS} años` : `Más ${w} que el ${share} % de ${YEARS} años`;
    return { head, note };
  }

  // Dibuja la anomalía en el panel de clima (sección #anom) y un punto de color bajo cada día del pronóstico
  function render({ lat, lon, daily, dateISO, reqId }) {
    const el = $('anom');
    if (!el) return;
    const days = daily.time, means = daily.temperature_2m_mean;
    const i0 = Math.max(0, days.indexOf(dateISO));
    loadSeries(lat, lon, days[0], days[days.length - 1]).then(years => {
      if (window.__wxReq !== reqId || !$('anom')) return;            // el panel ya muestra otro lugar u hora
      const st = days.map((d, i) => stats(years, utc(d), means[i]));
      const s = st[i0];
      if (!s) { el.remove(); return; }
      const w = wording(s), pos = Math.min(100, Math.max(0, (s.z + 3) / 6 * 100));
      if (window.lastWeatherData?.reqId === reqId) {                  // para la postal compartible
        window.lastWeatherData.anomaly = { delta: fmtDelta(s.delta), head: w.head, note: w.note, color: colorOf(s.z), z: s.z };
      }
      el.style.setProperty('--c', colorOf(s.z));
      el.title = `Referencia: temperatura media diaria de las mismas fechas (±${HALF} días) en los últimos ${YEARS} años. ` +
                 `Hoy ${means[i0].toFixed(1)} °C · media ${s.mean.toFixed(1)} °C · variación típica ±${s.sd.toFixed(1)} °C. Fuente: ERA5 vía Open-Meteo.`;
      el.innerHTML = `
        <div class="anom-top"><b>${fmtDelta(s.delta)}</b><span>${w.head}</span></div>
        <div class="anom-bar">${COLORS.map(c => `<i style="background:${c}"></i>`).join('')}<span class="anom-mark" style="left:${pos}%"></span></div>
        <small class="anom-note">${w.note}</small>`;
      document.querySelectorAll('.fc > div').forEach((cell, i) => {
        if (!st[i]) return;
        cell.insertAdjacentHTML('beforeend', `<i class="adot" style="--c:${colorOf(st[i].z)}" title="${fmtDelta(st[i].delta)} respecto a lo habitual"></i>`);
      });
    }).catch(() => {
      if (window.__wxReq === reqId && $('anom')) el.innerHTML = '<small>Histórico no disponible ahora</small>';
    });
  }

  window.climapiAnomaly = { render, stats };
})();
