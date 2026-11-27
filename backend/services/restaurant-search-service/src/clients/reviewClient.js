/**
 * Client gọi Feedback & Review Service (4005) để lấy điểm đánh giá phục vụ sắp xếp `rating`/`recommended`.
 * REVIEW thuộc service 4005 nên Restaurant Search không đọc bảng này.
 *
 * Hợp đồng DỰ KIẾN (service 4005 chưa có source):
 *   POST /api/v1/reviews/stats  { restaurant_ids: [...] }
 *   200 { success: true, data: [{ restaurant_id, rating, review_count }] }
 * Lỗi hoặc chưa cấu hình URL thì trả Map rỗng, kết quả tìm quán vẫn hoạt động (rating = null).
 */
function createReviewClient({ baseUrl, fetchImpl = fetch, timeoutMs = 3000, logger = console }) {
  const root = baseUrl ? baseUrl.replace(/\/+$/, '') : null;

  return {
    async getRatingStats(restaurantIds) {
      const stats = new Map();
      if (!root || restaurantIds.length === 0) return stats;
      try {
        const response = await fetchImpl(new URL('api/v1/reviews/stats', `${root}/`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ restaurant_ids: restaurantIds }),
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'error'
        });
        if (!response.ok) {
          await response.body?.cancel();
          return stats;
        }
        const payload = await response.json();
        for (const row of Array.isArray(payload?.data) ? payload.data : []) {
          if (typeof row?.restaurant_id === 'string' && Number.isFinite(row.rating)) {
            stats.set(row.restaurant_id, { rating: row.rating, reviewCount: Number(row.review_count) || 0 });
          }
        }
      } catch (error) {
        logger.warn?.(`[restaurant-search] Không lấy được điểm đánh giá: ${error.message}`);
      }
      return stats;
    }
  };
}

module.exports = { createReviewClient };
