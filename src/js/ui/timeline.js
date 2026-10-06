// Línea de tiempo global (-12 h ... +24 h): al moverla cambian temperatura/viento/nubes/lluvia (según la capa),
// la iluminación día-noche, la dirección de las partículas de viento y el clima del panel abierto.
(() => {
  const $ = id => document.getElementById(id);
  const range = $('tl-range'), label = $('tl-label'), play = $('tl-play'), nowBtn = $('tl-now');
  window.timelineOffset = 0;

  const fmt = off => off === 0 ? 'AHORA'
    : `${off > 0 ? '+' : '−'}${Math.abs(off)} H · ` + new Date(Date.now() + off * 3600e3)
      .toLocaleString('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

  let raf = 0, settle = 0, timer = 0;

  // low = true mientras se arrastra (menor resolución, más fluido); al soltar se vuelve a dibujar completo
  function apply(low) {
    const off = +range.value;
    window.timelineOffset = off;
    label.textContent = fmt(off);
    label.classList.toggle('shifted', off !== 0);
    window.setTimelineHours?.(off, low);
    window.setStormTime?.(off);                    // las tormentas recorren su trayectoria
    window.setDayNightTime?.(new Date(Date.now() + off * 3600e3), low);
    if (!low || timer) window.setSatelliteTime?.(off);   // imágenes reales de esa hora (al soltar o en reproducción; al arrastrar no, por los tiles)
    if (!low && !timer) window.refreshPanelWeather?.();
  }

  range.addEventListener('input', () => {
    stop();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => apply(true));
    clearTimeout(settle);
    settle = setTimeout(() => apply(false), 260);
  });

  function stop() {
    if (!timer) return;
    clearInterval(timer); timer = 0;
    play.querySelector('i').dataset.i = 'play'; PX.apply(play); play.title = 'Reproducir';
    apply(false);
  }
  function start() {
    if (+range.value >= 24) range.value = -12;
    play.querySelector('i').dataset.i = 'pause'; PX.apply(play); play.title = 'Pausar';
    timer = setInterval(() => {
      let v = +range.value + 0.5;
      if (v > 24) v = -12;
      range.value = v;
      apply(true);
    }, window.satelliteOn ? 900 : 320);        // con satélite, más lento para dar tiempo a cargar las imágenes
  }
  play.onclick = () => (timer ? stop() : start());

  nowBtn.onclick = () => {
    clearTimeout(settle);
    if (timer) { clearInterval(timer); timer = 0; play.querySelector('i').dataset.i = 'play'; PX.apply(play); }
    range.value = 0;
    apply(false);
  };
})();
