// Bán kính Trái Đất 6.371.000 m khớp với ST_Distance_Sphere(..., 6371000) của MySQL
// và Haversine R = 6371 km của frontend mock.
const EARTH_RADIUS_M = 6371000;
const METERS_PER_DEGREE_LAT = (Math.PI * EARTH_RADIUS_M) / 180;

const toRad = (deg) => (deg * Math.PI) / 180;

function haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Khung bao quanh để lọc thô bằng index (latitude, longitude).
 * Luôn là tập cha của hình tròn bán kính radiusM (nới thêm 2%) nên không loại nhầm
 * quán nằm sát rìa. Gần cực hoặc qua kinh tuyến 180° thì lấy cả dải kinh độ.
 */
function boundingBox(latitude, longitude, radiusM) {
  const padded = radiusM * 1.02;
  const latDelta = padded / METERS_PER_DEGREE_LAT;
  const minLat = Math.max(-90, latitude - latDelta);
  const maxLat = Math.min(90, latitude + latDelta);

  const nearPole = Math.abs(latitude) + latDelta >= 89.9;
  const lngDelta = nearPole ? 360 : latDelta / Math.cos(toRad(latitude));
  const crossesAntimeridian = longitude - lngDelta < -180 || longitude + lngDelta > 180;
  if (nearPole || crossesAntimeridian) return { minLat, maxLat, minLng: -180, maxLng: 180 };
  return { minLat, maxLat, minLng: longitude - lngDelta, maxLng: longitude + lngDelta };
}

const roundKm = (meters) => Math.round(meters / 10) / 100;

module.exports = { EARTH_RADIUS_M, haversineMeters, boundingBox, roundKm };
