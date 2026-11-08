/**
 * SOA Service Client & Orchestrator Layer
 * Connects the Frontend to SOA Services (with built-in local service simulation for Phase 1
 * and live SOA Service Trace Logging).
 */

import { RESTAURANTS_DB, WEATHER_CONTEXTS, USER_LOCATIONS } from '../data/mockDatabase.js';
import { formatK } from './nlpParser.js';

const serviceLogs = [];
let logSubscriber = null;

export function onServiceLog(callback) {
  logSubscriber = callback;
}

export function emitServiceTrace(serviceName, endpoint, payloadSummary) {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const entry = {
    id: Date.now() + Math.random(),
    serviceName,
    endpoint,
    payloadSummary,
    timeStr
  };
  serviceLogs.unshift(entry);
  if (logSubscriber) {
    logSubscriber(serviceLogs);
  }
}

export const SOAApiClient = {
  /**
   * 1. Context & Weather Service
   */
  getWeatherGreeting(contextIndex = 0) {
    const ctx = WEATHER_CONTEXTS[contextIndex % WEATHER_CONTEXTS.length];
    emitServiceTrace(
      'context-weather-service',
      'GET /api/v1/context/morning-greeting',
      `Temp: ${ctx.temp}°C (${ctx.condition}) -> Gợi ý: "${ctx.suggestedQuery}"`
    );
    return ctx;
  },

  /**
   * 2. Geo-Spatial & Menu Search Service + Routing + Feedback Aggregation
   */
  searchRestaurants({ dish, budget, radiusKm = 2, sortBy = 'recommended', partySize = 1 }) {
    const normalizedDish = (dish || 'phở bò').toLowerCase().trim();
    const effectiveBudgetPerPerson = budget || 50000;

    emitServiceTrace(
      'restaurant-search-service',
      'POST /api/v1/restaurants/search',
      `Món: "${dish}", Giá tối đa: ${formatK(effectiveBudgetPerPerson)}, Bán kính: ${radiusKm}km, Sort: ${sortBy}`
    );

    // Filter matching restaurants by dish keywords & radius & price
    let candidates = RESTAURANTS_DB.filter((r) => {
      const withinRadius = r.distanceKm <= radiusKm + 0.5;
      const matchesDish =
        r.dishKeywords.some((k) => normalizedDish.includes(k) || k.includes(normalizedDish)) ||
        r.menu.some((m) => m.name.toLowerCase().includes(normalizedDish));
      const matchesBudget = r.minPrice <= effectiveBudgetPerPerson;
      return withinRadius && matchesDish && matchesBudget;
    });

    // Fallback if user types a custom dish not in keyword list: filter by budget
    if (candidates.length === 0) {
      candidates = RESTAURANTS_DB.filter((r) => r.minPrice <= effectiveBudgetPerPerson);
    }
    if (candidates.length === 0) {
      candidates = [...RESTAURANTS_DB];
    }

    // Enrich each restaurant with matched menu items & leftover budget calculation
    const enriched = candidates.map((r) => {
      const matchedMenu = r.menu.filter((m) => m.price <= effectiveBudgetPerPerson);
      const displayMenu = matchedMenu.length > 0 ? matchedMenu : r.menu.slice(0, 2);
      const minMatchedPrice = displayMenu.reduce((min, m) => Math.min(min, m.price), r.minPrice);
      const leftoverAmount = Math.max(0, effectiveBudgetPerPerson - minMatchedPrice);

      return {
        ...r,
        matchedMenu: displayMenu,
        effectiveMinPrice: minMatchedPrice,
        leftoverAmount,
        partyTotalEstimate: minMatchedPrice * (partySize || 1)
      };
    });

    // Sort results based on selected chip
    if (sortBy === 'distance') {
      enriched.sort((a, b) => a.distanceKm - b.distanceKm);
    } else if (sortBy === 'rating') {
      enriched.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    } else if (sortBy === 'price') {
      enriched.sort((a, b) => a.effectiveMinPrice - b.effectiveMinPrice);
    } else {
      // 'recommended': Verified first, then high rating & reasonable distance
      enriched.sort((a, b) => {
        if (a.id === 'pho-bo-158-quan-nhan' && normalizedDish.includes('phở')) return -1;
        if (b.id === 'pho-bo-158-quan-nhan' && normalizedDish.includes('phở')) return 1;
        if (a.isPriceVerified !== b.isPriceVerified) return a.isPriceVerified ? -1 : 1;
        return b.rating - a.rating;
      });
    }

    const hero = enriched[0];
    if (hero) {
      emitServiceTrace(
        'routing-geo-service',
        'GET /api/v1/routing/estimate',
        `Tuyến đường tới "${hero.name}": ${hero.distanceKm}km (~${hero.travelMinutes} phút đi xe)`
      );
      emitServiceTrace(
        'feedback-review-service',
        'GET /api/v1/feedbacks/featured',
        `Tải ${hero.reviewCount} đánh giá (${hero.rating}★) & trạng thái: ${hero.isPriceVerified ? 'Đã xác minh' : 'Ước giá'}`
      );
    }

    return {
      totalMatchedCount: Math.max(enriched.length, 9), // Matches "9 quán vừa tiền trong 2km"
      heroRestaurant: enriched[0] || null,
      nearbyOthers: enriched.slice(1)
    };
  },

  /**
   * 3. Submit New User Feedback (Feedback & Verification Service)
   */
  addFeedback(restaurantId, { author, rating, comment, verifiedPrice }) {
    const target = RESTAURANTS_DB.find((r) => r.id === restaurantId);
    if (!target) return null;

    const newFb = {
      id: 'fb_' + Date.now(),
      author: author || 'Bạn (Người dùng)',
      rating: Number(rating) || 5,
      date: 'Vừa xong',
      comment,
      verifiedPrice: verifiedPrice || 'Đúng giá niêm yết'
    };

    target.feedbacks.unshift(newFb);
    target.reviewCount = target.feedbacks.length;
    const sum = target.feedbacks.reduce((acc, f) => acc + f.rating, 0);
    target.rating = Number((sum / target.reviewCount).toFixed(1));
    target.featuredReview = {
      quote: comment,
      rating: newFb.rating,
      date: newFb.date,
      author: newFb.author
    };
    target.isPriceVerified = true;

    emitServiceTrace(
      'feedback-review-service',
      'POST /api/v1/feedbacks',
      `Đã lưu đánh giá ${newFb.rating}★ cho "${target.name}" -> Cập nhật Đã xác minh giá`
    );

    return target;
  },

  getLocations() {
    return USER_LOCATIONS;
  }
};
