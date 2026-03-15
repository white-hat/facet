import * as L from 'leaflet';

/** Create a Leaflet map with the standard OSM tile layer. */
export function createLeafletMap(
  container: HTMLElement,
  options?: L.MapOptions,
): L.Map {
  const map = L.map(container, options);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
  return map;
}
