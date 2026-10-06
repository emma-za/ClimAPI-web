// Detección de dispositivo: táctil y "modo ligero" para móviles y equipos modestos.
// Debe cargarse el primero: otros módulos leen window.CLIMAPI al iniciarse.
//   ?lite=1 fuerza el modo ligero; ?lite=0 lo desactiva (útil para probar).
(() => {
  const q = new URLSearchParams(location.search).get('lite');
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches;
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  const lite = q === '1' ? true : q === '0' ? false : touch || weak;

  window.CLIMAPI = {
    touch, lite,
    // tamaños y ritmos que dependen de la potencia del dispositivo
    cloudN: lite ? 160 : 256,                 // resolución de las nubes animadas
    cloudFps: lite ? 5 : 10,
    spaceFps: lite ? 8 : 15,
    starDensity: lite ? 1500 : 900,           // píxeles de pantalla por estrella (más = menos estrellas)
    windParticles: lite ? 2200 : 5000,
    fieldHi: lite ? 384 : 512,                // mapa de color en reposo
    fieldLo: lite ? 192 : 256,                // mapa de color mientras se arrastra la línea de tiempo
    pixelRatio: lite ? Math.min(devicePixelRatio || 1, 2) : undefined
  };

  const root = document.documentElement;
  root.classList.toggle('is-touch', touch);
  root.classList.toggle('is-lite', lite);

  addEventListener('DOMContentLoaded', () => {
    const hint = document.getElementById('hint');
    if (touch && hint) hint.textContent = 'Toca cualquier punto del globo para ver el clima';
  });
})();
