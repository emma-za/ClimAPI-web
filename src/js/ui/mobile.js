// Comportamientos solo móviles (pantallas ≤ 700 px de ancho):
//  - mide la altura real de la línea de tiempo (--tl-h) para que el dock, el panel y los controles se apilen justo encima
//  - el panel de clima (hoja inferior) se pliega y despliega tocando su cabecera o el "asa" de arriba
//  - el mapa se centra en el espacio libre entre el buscador y la hoja/dock, para que el panel no tape el globo
//  - los créditos del mapa arrancan plegados (su texto largo se metería bajo el dock)
(() => {
  const mq = matchMedia('(max-width: 700px)');
  const $ = id => document.getElementById(id);

  // Relleno de la cámara: deja libres arriba (buscador, leyenda) y abajo (panel o dock + línea de tiempo)
  function updatePadding() {
    if (typeof map === 'undefined' || !map.loaded) return;
    let pad = { top: 0, right: 0, bottom: 0, left: 0 };
    if (mq.matches) {
      const H = innerHeight;
      const rail = $('rail').getBoundingClientRect();
      const panel = $('panel'), pr = panel.getBoundingClientRect();
      const lowest = !panel.hidden && pr.height ? Math.min(rail.top, pr.top) : rail.top;     // borde superior de lo que ocupa el fondo
      pad = { top: Math.round($('search').getBoundingClientRect().bottom + 8), right: 0, bottom: Math.max(0, Math.round(H - lowest + 8)), left: 0 };
    }
    map.easeTo({ padding: pad, duration: 300 });
  }

  addEventListener('DOMContentLoaded', () => {
    // altura de la línea de tiempo -> variable CSS (se actualiza si cambia el tamaño o la orientación)
    const tl = $('timeline');
    const setH = () => { document.documentElement.style.setProperty('--tl-h', tl.offsetHeight + 'px'); updatePadding(); };
    setH();
    if (window.ResizeObserver) new ResizeObserver(setH).observe(tl);
    addEventListener('resize', () => setTimeout(updatePadding, 50));
    mq.addEventListener?.('change', updatePadding);

    // panel plegable
    const panel = $('panel');
    panel.addEventListener('click', e => {
      if (!mq.matches) return;
      if (e.target.closest('#close, a, details')) return;                  // no interferir con cerrar, enlaces ni alertas
      if (e.target === panel || e.target.closest('.ph')) panel.classList.toggle('collapsed');
    });
    // el relleno sigue a la hoja: al abrirla/cerrarla, plegarla o cambiar su contenido
    const sync = () => requestAnimationFrame(updatePadding);
    new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['hidden', 'class'] });
    if (window.ResizeObserver) new ResizeObserver(sync).observe(panel);

    // espera al mapa: aplica el relleno inicial y pliega los créditos
    const wait = setInterval(() => {
      if (typeof map === 'undefined') return;
      clearInterval(wait);
      map.once('load', () => {
        updatePadding();
        if (mq.matches) document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      });
      // si el mapa ya estaba cargado cuando llegamos
      if (map.loaded()) updatePadding();
    }, 150);
  });
})();
