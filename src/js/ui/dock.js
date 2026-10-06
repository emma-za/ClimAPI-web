// Dock de capas: 3 botones-icono; cada uno abre un panel pequeño (solo uno a la vez).
(() => {
  const btns = [...document.querySelectorAll('.rail-btn')];
  const pops = [...document.querySelectorAll('.pop')];

  function open(name) {
    btns.forEach(b => b.setAttribute('aria-expanded', String(b.dataset.pop === name)));
    pops.forEach(p => { p.hidden = p.id !== 'pop-' + name; });
  }
  btns.forEach(b => b.addEventListener('click', () => open(b.getAttribute('aria-expanded') === 'true' ? null : b.dataset.pop)));

  // se cierra al tocar el mapa o con Escape
  document.getElementById('map').addEventListener('pointerdown', () => open(null));
  addEventListener('keydown', e => { if (e.key === 'Escape') open(null); });

  open('data');    // al entrar, el selector de dato queda abierto para que se vea qué se puede hacer
})();
