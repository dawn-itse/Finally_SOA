import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePolyline } from '../js/utils/polyline.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('decodePolyline: ví dụ chuẩn (độ chính xác 1e-5), trả [kinh độ, vĩ độ]', () => {
  const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.equal(points.length, 3);
  [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]].forEach(([lng, lat], i) => {
    close(points[i][0], lng);
    close(points[i][1], lat);
  });
});

test('decodePolyline: đoạn đường Hà Nội lấy từ tài liệu Goong Directions', () => {
  const points = decodePolyline('mtm_C{cudSh@C^C');
  assert.equal(points.length, 3);
  close(points[0][1], 21.04663); // vĩ độ điểm đầu khớp start_location trong tài liệu
  assert.ok(points[0][0] > 105.79 && points[0][0] < 105.80);
});

test('decodePolyline: đầu vào rỗng, sai kiểu hoặc bị cắt giữa chừng thì trả mảng rỗng', () => {
  for (const value of ['', null, undefined, 42, '_p~iF~ps|']) assert.deepEqual(decodePolyline(value), []);
});
