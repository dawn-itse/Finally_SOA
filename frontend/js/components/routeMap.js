import { requestGeo } from '../api/geo.js';

export { decodePolyline } from '../utils/polyline.mjs';

// MapLibre GL JS nạp theo nhu cầu (lần đầu bấm "Chỉ đường"), ghim phiên bản cố định.
const MAPLIBRE_VERSION = '4.7.1';
const MAPLIBRE_JS = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const MAPLIBRE_CSS = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;

const ORIGIN_COLOR = '#1B7A43';
const DESTINATION_COLOR = '#C84019';
const ROUTE_COLOR = '#2563EB';

// Nền dự phòng khi chưa có GOONG_MAPTILES_KEY (hoặc Map Key sai/hết hạn): ô bản đồ OpenStreetMap, không cần khóa.
const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors'
    }
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
};

let mapLibreLoading = null;

/** Nạp MapLibre (JS + CSS) một lần. Lỗi mạng thì cho phép thử lại ở lần bấm sau. */
export function loadMapLibre() {
  if (globalThis.maplibregl) return Promise.resolve(globalThis.maplibregl);
  if (!mapLibreLoading) {
    mapLibreLoading = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = MAPLIBRE_CSS;
      document.head.append(css);

      const script = document.createElement('script');
      script.src = MAPLIBRE_JS;
      script.async = true;
      script.onload = () => (globalThis.maplibregl ? resolve(globalThis.maplibregl) : fail(new Error('Thư viện bản đồ không khả dụng.')));
      script.onerror = () => fail(new Error('Không tải được thư viện bản đồ.'));
      document.head.append(script);

      function fail(error) {
        mapLibreLoading = null;
        css.remove();
        script.remove();
        reject(error);
      }
    });
  }
  return mapLibreLoading;
}

let styleRequest = null;

/**
 * Lấy style bản đồ: Goong (nếu Geo Service có Map Key và key còn dùng được) hoặc OpenStreetMap.
 * Kết quả được nhớ lại trong phiên để không gọi lặp.
 */
export function getMapStyle() {
  styleRequest ??= (async () => {
    try {
      const config = await requestGeo('map-config', {});
      const url = config?.style_url;
      if (!url) return OSM_STYLE;
      const response = await fetch(url); // Map Key sai thì trả 401/403: quay về OSM thay vì bản đồ trắng
      return response.ok ? url : OSM_STYLE;
    } catch {
      return OSM_STYLE;
    }
  })();
  return styleRequest;
}

/**
 * Dựng bản đồ trong `container` với hai điểm đánh dấu (xuất phát, quán).
 * Trả { setRoute(coordinates), destroy() }; `coordinates` là mảng [lng, lat] từ decodePolyline.
 */
export async function createRouteMap(container, { origin, destination, originLabel, destinationLabel, styleUrl }) {
  const maplibregl = await loadMapLibre();
  container.textContent = '';

  const originLngLat = [origin.longitude, origin.latitude];
  const destinationLngLat = [destination.longitude, destination.latitude];

  const map = new maplibregl.Map({
    container,
    style: styleUrl,
    center: destinationLngLat,
    zoom: 15
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  const addMarker = (lngLat, color, label) => {
    const marker = new maplibregl.Marker({ color }).setLngLat(lngLat);
    if (label) marker.setPopup(new maplibregl.Popup({ offset: 28, closeButton: false }).setText(label));
    return marker.addTo(map);
  };
  addMarker(originLngLat, ORIGIN_COLOR, originLabel);
  const destinationMarker = addMarker(destinationLngLat, DESTINATION_COLOR, destinationLabel);
  if (destinationLabel) destinationMarker.togglePopup();

  const fitTo = (coordinates) => {
    const bounds = coordinates.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
    map.fitBounds(bounds, { padding: 44, maxZoom: 17, duration: 0 });
  };
  fitTo([originLngLat, destinationLngLat]);

  const loaded = new Promise((resolve) => (map.loaded() ? resolve() : map.once('load', resolve)));
  loaded.then(() => map.resize());

  return {
    setRoute(coordinates) {
      if (!Array.isArray(coordinates) || coordinates.length < 2) return;
      loaded.then(() => {
        const feature = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
        const source = map.getSource('route');
        if (source) {
          source.setData(feature);
        } else {
          map.addSource('route', { type: 'geojson', data: feature });
          const layout = { 'line-join': 'round', 'line-cap': 'round' };
          map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout, paint: { 'line-color': '#FFFFFF', 'line-width': 9, 'line-opacity': 0.9 } });
          map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout, paint: { 'line-color': ROUTE_COLOR, 'line-width': 5, 'line-opacity': 0.95 } });
        }
        fitTo(coordinates);
      });
    },
    destroy() {
      map.remove();
    }
  };
}
