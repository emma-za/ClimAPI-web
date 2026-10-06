// Principales ciudades del mundo: nombre, latitud, longitud y peso (1-3).
// Las usan las luces nocturnas (daynight.js), los nombres del mapa (borders.js),
// los récords del día (explore.js) y el nombre del lugar al hacer clic (app.js).
(() => {
  const RAD = Math.PI / 180;

  // nombre, lat, lon, peso (1-3)
  const CITY_DATA = `Ciudad de México,19.43,-99.13,3;Acapulco,16.85,-99.88,1;Guadalajara,20.67,-103.35,2;Monterrey,25.67,-100.31,2;Cancún,21.16,-86.85,1;Tijuana,32.51,-117.04,1;
Los Ángeles,34.05,-118.24,3;San Francisco,37.77,-122.42,2;Seattle,47.61,-122.33,1;Denver,39.74,-104.99,1;Phoenix,33.45,-112.07,1;Dallas,32.78,-96.8,2;Houston,29.76,-95.37,2;Chicago,41.88,-87.63,3;
Nueva York,40.71,-74.01,3;Washington,38.91,-77.04,2;Miami,25.76,-80.19,2;Atlanta,33.75,-84.39,2;Toronto,43.65,-79.38,2;Montreal,45.5,-73.57,2;Vancouver,49.28,-123.12,1;La Habana,23.11,-82.37,1;
Guatemala,14.63,-90.51,1;Panamá,8.98,-79.52,1;Bogotá,4.71,-74.07,2;Medellín,6.24,-75.58,1;Caracas,10.48,-66.9,1;Quito,-0.18,-78.47,1;Lima,-12.05,-77.04,2;La Paz,-16.5,-68.15,1;
Santiago,-33.45,-70.67,2;Buenos Aires,-34.6,-58.38,3;Montevideo,-34.9,-56.16,1;São Paulo,-23.55,-46.63,3;Río de Janeiro,-22.91,-43.17,2;Brasilia,-15.79,-47.88,1;Salvador,-12.97,-38.5,1;
Manaos,-3.12,-60.02,1;Fortaleza,-3.73,-38.53,1;Anchorage,61.22,-149.9,1;Reikiavik,64.15,-21.94,1;Londres,51.51,-0.13,3;París,48.86,2.35,3;Madrid,40.42,-3.7,2;Barcelona,41.39,2.17,2;
Lisboa,38.72,-9.14,1;Roma,41.9,12.5,2;Milán,45.46,9.19,2;Berlín,52.52,13.4,2;Ámsterdam,52.37,4.9,2;Bruselas,50.85,4.35,1;Viena,48.21,16.37,1;Varsovia,52.23,21.01,1;Praga,50.08,14.44,1;
Budapest,47.5,19.04,1;Atenas,37.98,23.73,1;Estambul,41.01,28.98,3;Estocolmo,59.33,18.07,1;Oslo,59.91,10.75,1;Helsinki,60.17,24.94,1;Copenhague,55.68,12.57,1;Moscú,55.76,37.62,3;
San Petersburgo,59.93,30.34,2;Kiev,50.45,30.52,1;Bucarest,44.43,26.1,1;El Cairo,30.04,31.24,3;Alejandría,31.2,29.92,1;Casablanca,33.57,-7.59,1;Argel,36.75,3.06,1;Lagos,6.52,3.38,3;
Accra,5.6,-0.19,1;Dakar,14.72,-17.47,1;Abiyán,5.36,-4.01,1;Kinsasa,-4.44,15.27,2;Luanda,-8.84,13.23,1;Nairobi,-1.29,36.82,2;Adís Abeba,9.03,38.74,1;Dar es Salaam,-6.79,39.21,1;
Johannesburgo,-26.2,28.05,2;Ciudad del Cabo,-33.92,18.42,1;Durban,-29.86,31.02,1;Jartum,15.5,32.56,1;Riad,24.71,46.68,2;Yeda,21.54,39.17,1;Dubái,25.2,55.27,2;Teherán,35.69,51.39,2;
Bagdad,33.31,44.36,2;Tel Aviv,32.09,34.78,1;Karachi,24.86,67.0,3;Lahore,31.55,74.34,2;Delhi,28.61,77.21,3;Bombay,19.08,72.88,3;Bangalore,12.97,77.59,2;Chennai,13.08,80.27,2;
Calcuta,22.57,88.36,3;Daca,23.81,90.41,3;Colombo,6.93,79.86,1;Katmandú,27.72,85.32,1;Bangkok,13.76,100.5,3;Hanói,21.03,105.85,2;Ho Chi Minh,10.82,106.63,2;Singapur,1.35,103.82,2;
Kuala Lumpur,3.14,101.69,2;Yakarta,-6.21,106.85,3;Manila,14.6,120.98,3;Hong Kong,22.32,114.17,3;Cantón,23.13,113.26,3;Shanghái,31.23,121.47,3;Pekín,39.9,116.41,3;Chengdú,30.57,104.07,2;
Wuhan,30.59,114.31,2;Xi'an,34.34,108.94,2;Seúl,37.57,126.98,3;Tokio,35.68,139.69,3;Osaka,34.69,135.5,3;Sapporo,43.06,141.35,1;Taipéi,25.03,121.57,2;Ulán Bator,47.89,106.91,1;
Almaty,43.24,76.89,1;Taskent,41.3,69.24,1;Novosibirsk,55.03,82.92,1;Vladivostok,43.12,131.89,1;Sídney,-33.87,151.21,2;Melbourne,-37.81,144.96,2;Brisbane,-27.47,153.03,1;
Perth,-31.95,115.86,1;Auckland,-36.85,174.76,1;Honolulu,21.31,-157.86,1`;
  const CITIES = CITY_DATA.split(';').map(s => {
    const [name, lat, lon, w] = s.trim().split(',');
    return { name, lat: +lat, lon: +lon, w: +w };
  });
  window.CITIES = CITIES;

  // Ciudad conocida más cercana (< maxKm) a un punto
  window.nearestCity = (lat, lon, maxKm = 250) => {
    let best = null, bd = Infinity;
    for (const c of CITIES) {
      const dLat = (c.lat - lat) * RAD, dLon = (c.lon - lon) * RAD;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * RAD) * Math.cos(c.lat * RAD) * Math.sin(dLon / 2) ** 2;
      const km = 6371 * 2 * Math.asin(Math.sqrt(a));
      if (km < bd) { bd = km; best = c; }
    }
    return bd <= maxKm ? best : null;
  };
})();
