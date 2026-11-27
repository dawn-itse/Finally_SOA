export function geoPoint({ latitude, longitude }) {
  return `${latitude},${longitude}`;
}

export async function requestGeo(operation, params, signal) {
  const response = await fetch(`/api/geo/${operation}?${new URLSearchParams(params)}`, { signal });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || 'Không tải được dữ liệu Goong.');
  return result.data;
}
