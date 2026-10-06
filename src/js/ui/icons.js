// Iconos: Pixel Icon Library de HackerNoon (https://pixeliconlibrary.com, CC BY 4.0), servida por CDN.
// Los que la versión gratuita no incluye (termómetro, viento, gota, copo, manómetro, nube) están dibujados
// aquí en la misma cuadrícula de píxeles. Todos se pintan como máscara: toman el color del texto (currentColor).
(() => {
  const LIB = 'https://cdn.jsdelivr.net/npm/@hackernoon/pixel-icon-library@1.1.0/icons/SVG/regular/';

  // nombre lógico -> icono de la librería
  const FROM_LIB = {
    precip: 'cloud-rain', cloud: 'cloud-fog', uv: 'sun',
    layers: 'grid', explore: 'sparkles', night: 'moon', borders: 'globe-americas', names: 'tag', storm: 'bolt'
  };

  // dibujos propios 12x12 ('#' = píxel)
  const CUSTOM = {
    temp: [
      '....####....', '...#....#...', '...#.##.#...', '...#.##.#...', '...#.##.#...', '...#.##.#...',
      '..#..##..#..', '.#..####..#.', '.#..####..#.', '..#..##..#..', '...#....#...', '....####....'],
    humid: [
      '.....##.....', '.....##.....', '....####....', '....####....', '...######...', '...######...',
      '..########..', '..########..', '..########..', '..########..', '...######...', '....####....'],
    snow: [
      '.....##.....', '.#...##...#.', '..#..##..#..', '...#.##.#...', '....####....', '############',
      '############', '....####....', '...#.##.#...', '..#..##..#..', '.#...##...#.', '.....##.....'],
    sat: [
      '............', '............', '............', '###......###', '###.####.###', '###.####.###',
      '###.####.###', '###.####.###', '###......###', '............', '............', '............'],
    clouds: [
      '............', '............', '....####....', '...######...', '..#########.', '.###########',
      '############', '############', '############', '.##########.', '............', '............'],
    press: [
      '....####....', '..##....##..', '.#........#.', '.#......#.#.', '#......#...#', '#.....#....#',
      '#....##....#', '#....##....#', '.#........#.', '.#........#.', '..##....##..', '....####....'],
    wind: [
      '............', '..######....', '........#...', '........#...', '.#########..', '............',
      '####........', '....#######.', '...........#', '...........#', '..#########.', '............']
  };

  // remolino de ciclón generado (mismo espíritu que el marcador del mapa)
  CUSTOM.cyclone = Array.from({ length: 12 }, (_, y) => Array.from({ length: 12 }, (_, x) => {
    const dx = x + 0.5 - 6, dy = y + 0.5 - 6, r = Math.hypot(dx, dy);
    return r <= 5.8 && r > 1.2 && Math.sin(Math.atan2(dy, dx) * 3 + r * 1.1) > 0.05 ? '#' : '.';
  }).join(''));
  CUSTOM.volcano = [
    '...#...#....', '....#.#..#..', '...#.#.#.#..', '....#####...', '...#######..', '..#########.',
    '.###########', '############', '############', '############', '............', '............'];

  const bitmapUrl = rows => {
    let d = '';
    rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') d += `M${x} ${y}h1v1h-1z`; }));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges"><path d="${d}"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  };

  const cache = {};
  const url = name => cache[name] ??= CUSTOM[name] ? bitmapUrl(CUSTOM[name]) : `url("${LIB}${FROM_LIB[name] || name}.svg")`;

  window.PX = {
    url,
    html: name => `<i class="px" style="--i:${url(name).replace(/"/g, '&quot;')}"></i>`,
    // rellena los <i data-i="nombre"> del HTML estático
    apply(root = document) {
      root.querySelectorAll('[data-i]').forEach(el => { el.classList.add('px'); el.style.setProperty('--i', url(el.dataset.i)); });
    }
  };
  PX.apply();
})();
