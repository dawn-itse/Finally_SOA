/**
 * Giải mã "encoded polyline" (độ chính xác 1e-5) mà Goong Directions trả ở overview_polyline.points.
 * Trả về mảng [kinh độ, vĩ độ] (thứ tự của MapLibre/GeoJSON). Chuỗi rỗng hoặc hỏng trả mảng rỗng.
 * File .mjs thuần, không đụng DOM nên chạy được cả trong trình duyệt lẫn Node (để kiểm thử).
 */
export function decodePolyline(encoded) {
  if (typeof encoded !== 'string' || encoded.length === 0) return [];
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const readDelta = () => {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      if (index >= encoded.length) return null; // chuỗi bị cắt giữa chừng
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    const dLat = readDelta();
    const dLng = dLat === null ? null : readDelta();
    if (dLat === null || dLng === null) return [];
    lat += dLat;
    lng += dLng;
    points.push([lng * 1e-5, lat * 1e-5]);
  }
  return points;
}
