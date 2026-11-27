export function geoPoint({ latitude, longitude }) {
  return `${latitude},${longitude}`;
}

export async function requestGeo(operation, params, signal) {
  const response = await fetch(`/api/geo/${operation}?${new URLSearchParams(params)}`, { signal });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || 'Không tải được dữ liệu Goong.');
  return result.data;
}

export async function discoverPlaces(dish, anchor, radiusKm, signal) {
  const predictions = await requestGeo('autocomplete', {
    input: `quán ${dish}`,
    location: geoPoint(anchor),
    radius: radiusKm
  }, signal);
  const ids = [...new Set(predictions.map(({ place_id }) => place_id))].slice(0, 5);
  const details = await Promise.allSettled(ids.map((place_id) => requestGeo('place-detail', { place_id }, signal)));
  if (signal.aborted) throw signal.reason;
  const places = details.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  if (ids.length && !places.length) throw new Error('Không lấy được chi tiết địa điểm.');
  return places;
}
