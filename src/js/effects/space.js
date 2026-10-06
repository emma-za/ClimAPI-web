// Atmósfera espacial: estrellas que vibran, nebulosas tenues y estrellas fugaces (canvas detrás del mapa).
(() => {
  const DEV = window.CLIMAPI || {};
  const FPS = DEV.spaceFps || 15;       // ritmo entrecortado a propósito, para el look pixel (menor en móviles)

  const mk = (z) => {
    const c = document.createElement('canvas');
    c.style.cssText = `position:absolute;inset:0;width:100%;height:100%;z-index:${z};pointer-events:none;image-rendering:pixelated`;
    return c;
  };
  const back = mk(0);
  document.body.prepend(back);
  const bctx = back.getContext('2d');

  let W = 0, H = 0, stars = [];
  const rnd = (a, b) => a + Math.random() * (b - a);

  function resize() {
    W = back.width = Math.ceil(innerWidth / 2);   // resolución a la mitad -> píxeles gruesos
    H = back.height = Math.ceil(innerHeight / 2);
    const n = Math.round(W * H / (DEV.starDensity || 900));
    stars = Array.from({ length: n }, () => ({
      x: Math.floor(rnd(0, W)), y: Math.floor(rnd(0, H)),
      b: rnd(0.25, 1), f: rnd(0.6, 3.2), p: rnd(0, 6.28),
      big: Math.random() < 0.06,
      c: Math.random() < 0.15 ? '170,200,255' : Math.random() < 0.15 ? '255,225,180' : '235,240,255'
    }));
  }
  addEventListener('resize', resize);
  resize();

  // --- estrella fugaz ---
  let shoot = null, nextShoot = performance.now() + rnd(4000, 9000);

  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (now - last < 1000 / FPS) return;
    last = now;
    const t = now / 1000;

    bctx.clearRect(0, 0, W, H);

    // nebulosa muy tenue
    const g = bctx.createRadialGradient(W * 0.72, H * 0.3, 0, W * 0.72, H * 0.3, W * 0.45);
    g.addColorStop(0, 'rgba(60,40,110,0.16)'); g.addColorStop(1, 'rgba(60,40,110,0)');
    bctx.fillStyle = g; bctx.fillRect(0, 0, W, H);
    const g2 = bctx.createRadialGradient(W * 0.2, H * 0.75, 0, W * 0.2, H * 0.75, W * 0.4);
    g2.addColorStop(0, 'rgba(20,70,90,0.14)'); g2.addColorStop(1, 'rgba(20,70,90,0)');
    bctx.fillStyle = g2; bctx.fillRect(0, 0, W, H);

    // estrellas: parpadeo suave + algún destello brusco
    for (const s of stars) {
      let a = s.b * (0.5 + 0.5 * Math.sin(t * s.f + s.p));
      if (Math.random() < 0.004) a = 1;
      a = Math.round(a * 4) / 4;                                   // 4 niveles de brillo
      if (a <= 0) continue;
      bctx.fillStyle = `rgba(${s.c},${a})`;
      bctx.fillRect(s.x, s.y, 1, 1);
      if (s.big && a >= 0.5) {                                     // estrellas grandes con cruz
        bctx.fillRect(s.x - 1, s.y, 3, 1); bctx.fillRect(s.x, s.y - 1, 1, 3);
      }
    }

    // estrella fugaz ocasional
    if (!shoot && now > nextShoot) {
      shoot = { x: rnd(W * 0.3, W), y: rnd(0, H * 0.4), vx: -rnd(2.2, 3.2), vy: rnd(1, 1.6), life: 0 };
    }
    if (shoot) {
      for (let k = 0; k < 7; k++) {
        bctx.fillStyle = `rgba(255,255,255,${(1 - k / 7) * (1 - shoot.life / 22)})`;
        bctx.fillRect(Math.round(shoot.x - shoot.vx * k * 0.7), Math.round(shoot.y - shoot.vy * k * 0.7), 1, 1);
      }
      shoot.x += shoot.vx; shoot.y += shoot.vy;
      if (++shoot.life > 22) { shoot = null; nextShoot = now + rnd(6000, 14000); }
    }
  }
  requestAnimationFrame(frame);
})();
