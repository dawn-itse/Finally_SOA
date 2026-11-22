/**
 * UI Component Renderers for "Mua Gì Đây" Frontend
 * Renders all 8 screen states faithfully.
 */

import { FoodIllustrations, getDishIllustration } from './svgIcons.js';
import { formatK } from '../services/nlpParser.js';

/**
 * Screen 1: Home Weather & Floating Food Illustration Greeting
 */
export function renderHomeHero(weatherContext) {
  return `
    <section class="home-hero-section">
      <div class="food-illustration-stage">
        <div class="food-item-art top-left-banhmi" data-quick-dish="Bánh mì pate" title="Tìm Bánh mì pate">
          ${FoodIllustrations.banhMi(84)}
        </div>
        <div class="food-item-art top-right-coffee" data-quick-dish="Cà phê sữa" title="Tìm Cà phê sữa">
          ${FoodIllustrations.icedCoffee(76)}
        </div>
        <div class="food-item-art center-pho" data-quick-dish="Phở bò" title="Tìm Phở bò">
          ${FoodIllustrations.phoBowl(118)}
        </div>
        <div class="food-item-art bottom-left-com" data-quick-dish="Cơm rang" title="Tìm Cơm tấm / Cơm rang">
          ${FoodIllustrations.ricePlate(88)}
        </div>
        <div class="food-item-art bottom-right-bobatea" data-quick-dish="Bún riêu cua" title="Tìm Bún riêu & Trà đào">
          ${FoodIllustrations.peachTea(80)}
        </div>
      </div>

      <h1 class="hero-question-title">${weatherContext.greetingQuestion}</h1>

      <div class="weather-badge-line">
        <span>${weatherContext.temp}° · ${weatherContext.condition}</span>
      </div>

      <p class="weather-context-quote" id="btnWeatherSuggestion" title="Nhấn để thử gợi ý này">
        ${weatherContext.suggestionQuote}
      </p>
    </section>
  `;
}

/**
 * Screens 3 & 5: Radar Scanning Component
 */
export function renderRadarWidget(mode = 'banhmi') {
  const blip1Icon = mode === 'pho' ? FoodIllustrations.phoBowl(30) : FoodIllustrations.banhMi(28);
  const blip2Icon = mode === 'pho' ? FoodIllustrations.phoBowl(28) : FoodIllustrations.phoBowl(28);
  const blip3Icon = mode === 'pho' ? FoodIllustrations.ricePlate(28) : FoodIllustrations.banhMi(26);

  return `
    <div class="radar-widget-container">
      <div class="radar-circle">
        <div class="radar-ring r1"></div>
        <div class="radar-ring r2"></div>
        <div class="radar-sweep"></div>
        <div class="radar-center-dot"></div>

        <!-- Food Blips on Radar -->
        <div class="radar-blip" style="left: 22%; top: 53%;">
          ${blip1Icon}
        </div>
        <div class="radar-blip" style="left: 55%; top: 34%; animation-delay: 0.4s;">
          ${blip2Icon}
        </div>
        <div class="radar-blip" style="left: 58%; top: 69%; animation-delay: 0.8s;">
          ${blip3Icon}
        </div>
      </div>
      <div class="radar-caption">Đang tìm quán gần bạn...</div>
    </div>
  `;
}

/**
 * Bot Avatar SVG
 */
function renderBotAvatar() {
  return `
    <div class="bot-avatar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
        <line x1="7" y1="7" x2="7.01" y2="7"></line>
      </svg>
    </div>
  `;
}

/**
 * Render Chat Messages + Optional Budget Quick Replies + Optional Radar + Optional Results
 */
export function renderConversationStream(state) {
  let html = `<div class="chat-stream">`;

  // Initial bot question bubble
  html += `
    <div class="chat-row bot">
      ${renderBotAvatar()}
      <div class="bot-bubble-group">
        <div class="bot-bubble">Sáng nay bạn muốn chi bao nhiêu tiền?</div>
      </div>
    </div>
  `;

  // Render conversation turns
  for (const msg of state.messages) {
    if (msg.sender === 'user') {
      html += `
        <div class="chat-row user">
          <div class="user-bubble">${escapeHtml(msg.text)}</div>
        </div>
      `;
    } else if (msg.sender === 'bot') {
      html += `
        <div class="chat-row bot">
          ${renderBotAvatar()}
          <div class="bot-bubble-group">
            <div class="bot-bubble">${escapeHtml(msg.text)}</div>
          </div>
        </div>
      `;
    }
  }

  // If waiting for budget slot (Screen 4: 30k, 50k, 100k, 200k)
  if (state.step === 'ASK_BUDGET') {
    html += `
      <div class="quick-budget-chips">
        <button class="btn-budget-option" data-budget="30000">30k</button>
        <button class="btn-budget-option" data-budget="50000">50k</button>
        <button class="btn-budget-option" data-budget="100000">100k</button>
        <button class="btn-budget-option" data-budget="200000">200k</button>
      </div>
    `;
  }

  // If scanning radar (Screens 3 & 5)
  if (state.isScanning) {
    const mode = (state.dish || '').toLowerCase().includes('phở') ? 'pho' : 'banhmi';
    html += renderRadarWidget(mode);
  }

  // If results are ready (Screens 6, 7, 8)
  if (state.step === 'RESULTS' && !state.isScanning && state.searchResults) {
    html += renderResultsSection(state);
  }

  html += `</div>`;
  return html;
}

/**
 * Screens 6, 7, 8: Full Results Section (Header + Tabs + Sort Chips + Hero Card + Nearby Carousel)
 */
export function renderResultsSection(state) {
  const { dish, budget, radiusKm, viewMode, sortBy, partySize, favorites, showAllNearby } = state;
  const { totalMatchedCount, heroRestaurant, nearbyOthers } = state.searchResults;

  if (!heroRestaurant) {
    return `<div class="bot-bubble">Chưa tìm thấy quán phù hợp, bạn thử tăng ngân sách hoặc bán kính nhé!</div>`;
  }

  const partyNote = partySize > 1 ? ` · ${partySize} người` : '';

  return `
    <div class="results-container">
      <div class="results-top-row">
        <!-- Summary Header ("Phở bò · tối đa 50k" / "9 quán vừa tiền trong 2km") -->
        <div class="query-summary-bar">
          <div class="query-dish-thumb">
            ${getDishIllustration(dish, 38)}
          </div>
          <div class="query-summary-text">
            <h3>${escapeHtml(dish || 'Món ăn sáng')} · tối đa ${formatK(budget)}${partyNote}</h3>
            <p>${totalMatchedCount} quán vừa tiền trong ${radiusKm}km</p>
          </div>
        </div>

        <!-- Segmented View Toggle: Danh sách | Bản đồ -->
        <div class="view-mode-segmented">
          <button class="btn-view-tab ${viewMode === 'list' ? 'active' : ''}" data-view-mode="list">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
              <line x1="3" y1="6" x2="3.01" y2="6"></line>
              <line x1="3" y1="12" x2="3.01" y2="12"></line>
              <line x1="3" y1="18" x2="3.01" y2="18"></line>
            </svg>
            Danh sách
          </button>
          <button class="btn-view-tab ${viewMode === 'map' ? 'active' : ''}" data-view-mode="map">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
              <line x1="8" y1="2" x2="8" y2="18"></line>
              <line x1="16" y1="6" x2="16" y2="22"></line>
            </svg>
            Bản đồ
          </button>
        </div>
      </div>

      ${renderSortChips(sortBy)}

      ${
        viewMode === 'map'
          ? renderInteractiveMapView(heroRestaurant, nearbyOthers)
          : renderHeroCardAndNearbyList(heroRestaurant, nearbyOthers, favorites, showAllNearby, partySize)
      }
    </div>
  `;
}

const SORT_ICONS = {
  recommended: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"></path><path d="M19 3v4M17 5h4"></path></svg>`,
  distance: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
  rating: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  price: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2m0 8v2"></path></svg>`
};

/**
 * Sort Chips Row (Đề xuất, Gần → xa, Đánh giá, Rẻ → đắt) — shared by results & explorer
 */
export function renderSortChips(sortBy) {
  const items = [
    ['recommended', 'Đề xuất'],
    ['distance', 'Gần → xa'],
    ['rating', 'Đánh giá'],
    ['price', 'Rẻ → đắt']
  ];
  return `
    <div class="sort-chips-row">
      ${items
        .map(
          ([key, label]) => `
        <button class="btn-sort-chip ${sortBy === key ? 'active' : ''}" data-sort="${key}">
          ${SORT_ICONS[key]} ${label}
        </button>`
        )
        .join('')}
    </div>
  `;
}

function renderMiniCardPrice(place) {
  const prefix = place.effectiveMinPrice < place.maxPrice ? '<span class="price-from">từ</span>' : '';
  const leftover = place.leftoverAmount > 0 ? `<span class="price-leftover">dư ${formatK(place.leftoverAmount)}</span>` : '';
  return `
    <div class="mini-card-price">
      <div class="price-main">${prefix}${formatK(place.effectiveMinPrice ?? place.minPrice)}</div>
      ${leftover}
    </div>
  `;
}

/**
 * Hero Restaurant Card + Secondary Nearby Section (Screens 6 & 7)
 */
function renderHeroCardAndNearbyList(hero, nearbyOthers, favorites, showAllNearby, partySize) {
  const isFav = favorites.has(hero.id);
  const leftoverBadge =
    hero.leftoverAmount > 0
      ? `<span class="budget-leftover-pill">dư ${formatK(hero.leftoverAmount)}</span>`
      : `<span class="budget-leftover-pill">vừa khít ngân sách</span>`;

  const partyBadge =
    partySize > 1
      ? `<span class="budget-leftover-pill" style="background:#FFF3D6;color:#945800;">${partySize} người ~ ${formatK(hero.partyTotalEstimate)}</span>`
      : '';

  return `
    <div class="results-split">
    <!-- Hero Restaurant Card -->
    <article class="hero-restaurant-card" data-restaurant-id="${hero.id}">
      <div class="card-minimap-header">
        ${FoodIllustrations.miniRouteMap()}

        <div class="minimap-travel-pill">
          <span style="color:#1D5BD6;">🛵</span>
          <span>${hero.travelMinutes} phút đi xe · ${hero.distanceKm.toString().replace('.', ',')}km</span>
        </div>

        <div class="minimap-top-actions">
          <button class="btn-circle-icon ${isFav ? 'favorited' : ''}" data-action="toggle-fav" data-id="${hero.id}" title="Lưu quán yêu thích">
            ${isFav ? '♥' : '♡'}
          </button>
          <button class="btn-circle-icon" data-action="open-menu" data-id="${hero.id}" title="Xem chi tiết & đánh giá">
            ⋯
          </button>
        </div>

        <div class="minimap-dish-sticker">
          ${getDishIllustration(hero.categoryLabel, 76)}
        </div>
      </div>

      <div class="hero-card-body">
        <div class="hero-badges-row">
          <div class="recommend-badge">${SORT_ICONS.recommended} Nên chọn</div>
          ${
            hero.isPriceVerified
              ? `<div class="verified-badge">✓ Đã xác minh</div>`
              : `<div class="unverified-badge">⏳ Đang ước giá...</div>`
          }
        </div>

        <h2 class="restaurant-title">${escapeHtml(hero.name)}</h2>

        <div class="restaurant-meta-line">
          <span>${escapeHtml(hero.categoryLabel)}</span>
          <span>·</span>
          <span>${hero.distanceKm.toString().replace('.', ',')}km</span>
          <span>·</span>
          <span>🛵 ${hero.travelMinutes} phút</span>
          <span>·</span>
          <span class="open-status-green">Mở tới ${hero.openUntil}</span>
        </div>

        <div class="restaurant-address-line">${escapeHtml(hero.address)}</div>

        <!-- Price & Leftover Budget Row -->
        <div class="price-budget-row">
          <div class="price-tag-main">
            <span>từ</span>
            <strong>${formatK(hero.effectiveMinPrice)}</strong>
          </div>
          ${leftoverBadge}
          ${partyBadge}
        </div>

        <!-- Rating & Featured Review Quote -->
        <div class="rating-summary-line" data-action="open-menu" data-id="${hero.id}">
          <span style="color:#F59E0B;">⭐</span>
          <strong>${hero.rating.toFixed(1).replace('.', ',')}</strong>
          <span>· ${hero.reviewCount} đánh giá (Nhấn để xem / gửi feedback)</span>
        </div>

        <blockquote class="featured-review-quote">
          “${escapeHtml(hero.featuredReview.quote)}”
          <span class="quote-author">– khách chấm ${hero.featuredReview.rating}★ · ${hero.featuredReview.date}</span>
        </blockquote>

        <!-- Matched Menu Dish Chips -->
        <div class="matched-dishes-row">
          ${hero.matchedMenu
            .slice(0, 3)
            .map(
              (item) => `
              <span class="dish-price-chip">
                ${escapeHtml(item.name)} <strong>${formatK(item.price)}</strong>
              </span>
            `
            )
            .join('')}
        </div>

        <!-- Action Buttons: Chỉ đường & Menu -->
        <div class="card-cta-row">
          <button class="btn-cta-primary" data-action="open-directions" data-id="${hero.id}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
              <circle cx="6" cy="19" r="3"></circle>
              <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"></path>
              <circle cx="18" cy="5" r="3"></circle>
            </svg>
            Chỉ đường
          </button>
          <button class="btn-cta-secondary" data-action="open-menu" data-id="${hero.id}">
            🍴 Menu & Feedback
          </button>
        </div>
      </div>
    </article>

    <!-- Secondary Nearby Section ("Quán khác gần đây") -->
    ${
      nearbyOthers.length > 0
        ? `
      <div class="nearby-others-section">
        <div class="nearby-section-header">
          <h4>Quán khác gần đây</h4>
          <button class="btn-link-orange" id="btnOpenExplorer">
            Xem cả ${nearbyOthers.length + 1} quán
          </button>
        </div>

        <div class="nearby-carousel">
          ${nearbyOthers
            .map(
              (place) => `
              <div class="nearby-mini-card" data-action="promote-hero" data-id="${place.id}">
                <div class="mini-card-thumb">
                  ${getDishIllustration(place.categoryLabel, 42)}
                </div>
                <div class="mini-card-info">
                  <div class="comparison-tag">${escapeHtml(place.comparisonBadge || `Cách ${place.distanceKm}km`)}</div>
                  <div class="mini-card-title">${escapeHtml(place.name)}</div>
                  <div class="mini-card-sub">
                    ${place.isPriceVerified ? `Từ ${formatK(place.minPrice)}` : 'Đang ước giá...'} · ${place.distanceKm.toString().replace('.', ',')}km · ${place.travelMinutes} phút đi xe
                  </div>
                </div>
                ${renderMiniCardPrice(place)}
              </div>
            `
            )
            .join('')}
        </div>

        <button class="btn-expand-more-places" id="btnOpenExplorerMore">
          + Xem tất cả quán quanh bạn
        </button>
      </div>
    `
        : ''
    }
    </div>
  `;
}

/**
 * Interactive Map View when user switches to "Bản đồ" tab
 */
function renderInteractiveMapView(hero, nearbyOthers) {
  const allPlaces = [hero, ...nearbyOthers];
  return `
    <div class="map-view-layout">
    <div class="interactive-map-box">
      ${FoodIllustrations.miniRouteMap()}
      ${allPlaces
        .map(
          (p, idx) => `
          <button
            class="map-pin-marker ${idx === 0 ? 'selected' : ''}"
            style="left: ${p.mapPos?.x || 50}%; top: ${p.mapPos?.y || 50}%;"
            data-action="promote-hero"
            data-id="${p.id}"
          >
            🍴 ${escapeHtml(p.name.split('-')[0].trim())} · ${formatK(p.minPrice)}
          </button>
        `
        )
        .join('')}
    </div>
    <div class="map-side-list">
      ${allPlaces
        .map(
          (place, idx) => `
          <div class="nearby-mini-card ${idx === 0 ? 'is-selected' : ''}" data-action="promote-hero" data-id="${place.id}">
            <div class="mini-card-thumb">${getDishIllustration(place.categoryLabel, 40)}</div>
            <div class="mini-card-info">
              <div class="comparison-tag">${idx === 0 ? 'Đang chọn' : escapeHtml(place.comparisonBadge || `Cách ${place.distanceKm}km`)}</div>
              <div class="mini-card-title">${escapeHtml(place.name)}</div>
              <div class="mini-card-sub">${place.distanceKm.toString().replace('.', ',')}km · ${place.travelMinutes} phút đi xe</div>
            </div>
            ${renderMiniCardPrice(place)}
          </div>
        `
        )
        .join('')}
    </div>
    </div>
  `;
}

/**
 * Full Places Explorer ("Quán quanh bạn") — list of all matched places + menu detail pane
 */
export function renderPlacesExplorer(state, selectedMenuId) {
  const { dish, budget, radiusKm, sortBy, favorites } = state;
  const results = state.searchResults;
  const places = results ? [results.heroRestaurant, ...results.nearbyOthers].filter(Boolean) : [];
  const selected = places.find((p) => p.id === selectedMenuId);

  return `
    <div class="explorer-header">
      <div class="explorer-header-top">
        <div>
          <h2 class="explorer-title">Quán quanh bạn</h2>
          <p class="explorer-subtitle">${escapeHtml(dish || 'Món ăn')} · tối đa ${formatK(budget)} · trong ${radiusKm}km</p>
        </div>
        <button class="btn-close-modal" data-action="close-explorer" title="Đóng">✕</button>
      </div>
      ${renderSortChips(sortBy)}
    </div>

    <div class="explorer-body">
      <div class="explorer-list">
        ${places.map((p) => renderExplorerPlaceCard(p, favorites, p.id === selectedMenuId)).join('')}
      </div>
      <aside class="explorer-detail-pane">
        ${
          selected
            ? `
          <div class="pane-header">
            <div>
              <div class="modal-title">${escapeHtml(selected.name)}</div>
              <div class="pane-address">${escapeHtml(selected.address)}</div>
            </div>
          </div>
          ${renderMenuAndFeedbackBody(selected, budget)}
        `
            : `
          <div class="pane-placeholder">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"></path></svg>
            <span>Bấm "Menu" ở một quán để xem thực đơn và giá ở đây.</span>
          </div>
        `
        }
      </aside>
    </div>
  `;
}

function renderExplorerPlaceCard(place, favorites, isActive) {
  const isFav = favorites.has(place.id);
  const fromLabel = place.effectiveMinPrice < place.maxPrice ? '<span class="price-from">từ</span>' : '';
  return `
    <article class="explorer-card ${isActive ? 'active' : ''}">
      <div class="explorer-card-head">
        <div class="mini-card-thumb">${getDishIllustration(place.categoryLabel, 42)}</div>
        <div class="explorer-card-info">
          <h3>${escapeHtml(place.name)}</h3>
          <div class="restaurant-meta-line">
            <span>${escapeHtml(place.categoryLabel)}</span><span>·</span>
            <span>${place.distanceKm.toString().replace('.', ',')}km</span><span>·</span>
            <span>🛵 ${place.travelMinutes} phút</span>
          </div>
          <div class="restaurant-address-line">${escapeHtml(place.address)}</div>
        </div>
      </div>

      <div class="explorer-price-row">
        <div class="explorer-price">${fromLabel}<strong>${formatK(place.effectiveMinPrice ?? place.minPrice)}</strong></div>
        ${place.leftoverAmount > 0 ? `<span class="budget-leftover-pill">dư ${formatK(place.leftoverAmount)}</span>` : ''}
        ${place.isPriceVerified ? `<span class="verified-badge">✓ Đã xác minh</span>` : `<span class="unverified-badge">⏳ Đang ước giá</span>`}
        <div class="explorer-card-icons">
          <button class="btn-ghost-icon ${isFav ? 'favorited' : ''}" data-action="toggle-fav" data-id="${place.id}" title="Lưu quán yêu thích">${isFav ? '♥' : '♡'}</button>
          <button class="btn-ghost-icon" data-action="explorer-menu" data-id="${place.id}" title="Xem chi tiết">⋯</button>
        </div>
      </div>

      <div class="open-hours-line">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        Mở tới ${escapeHtml(place.openUntil)} · ⭐ ${place.rating.toFixed(1).replace('.', ',')} (${place.reviewCount} đánh giá)
      </div>

      <div class="matched-dishes-row">
        ${(place.matchedMenu || place.menu)
          .slice(0, 3)
          .map((item) => `<span class="dish-price-chip">${escapeHtml(item.name)} <strong>${formatK(item.price)}</strong></span>`)
          .join('')}
      </div>

      <div class="card-cta-row">
        <button class="btn-cta-primary" data-action="open-directions" data-id="${place.id}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="6" cy="19" r="3"></circle><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"></path><circle cx="18" cy="5" r="3"></circle></svg>
          Chỉ đường
        </button>
        <button class="btn-cta-secondary" data-action="explorer-menu" data-id="${place.id}">🍴 Menu</button>
      </div>
    </article>
  `;
}

/**
 * Modal Content: Restaurant Full Menu + Customer Feedbacks + New Feedback Form
 */
export function renderMenuAndFeedbackModal(restaurant, currentBudget) {
  return `
    <div class="modal-handle"></div>
    <div class="modal-header">
      <div>
        <div class="modal-title">${escapeHtml(restaurant.name)}</div>
        <div style="font-size:0.78rem;color:var(--text-secondary);">${escapeHtml(restaurant.address)}</div>
      </div>
      <button class="btn-close-modal" id="btnCloseModal">✕</button>
    </div>
    ${renderMenuAndFeedbackBody(restaurant, currentBudget)}
  `;
}

function renderMenuAndFeedbackBody(restaurant, currentBudget) {
  const budgetLimit = currentBudget || 50000;
  return `
    <h4 style="font-size:0.9rem;margin-bottom:8px;color:var(--primary);">🍴 Thực đơn quán (Đánh dấu món vừa túi tiền <= ${formatK(budgetLimit)})</h4>
    <div class="menu-list-group">
      ${restaurant.menu
        .map((item) => {
          const fits = item.price <= budgetLimit;
          return `
            <div class="menu-item-row ${fits ? 'within-budget' : ''}">
              <div>
                <strong style="font-size:0.88rem;">${escapeHtml(item.name)}</strong>
                ${fits ? `<span style="font-size:0.72rem;color:var(--verified-text);margin-left:6px;font-weight:700;">✓ Vừa ngân sách</span>` : ''}
              </div>
              <strong style="color:var(--primary);font-size:0.9rem;">${formatK(item.price)}</strong>
            </div>
          `;
        })
        .join('')}
    </div>

    <h4 style="font-size:0.9rem;margin-bottom:8px;">💬 Đánh giá thực tế từ khách hàng (${restaurant.reviewCount})</h4>
    <div class="feedback-list">
      ${restaurant.feedbacks
        .map(
          (fb) => `
          <div class="feedback-card-item">
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px;">
              <strong>👤 ${escapeHtml(fb.author)} · <span style="color:#F59E0B;">${'★'.repeat(fb.rating)}</span></strong>
              <span style="color:var(--text-muted);">${escapeHtml(fb.date)}</span>
            </div>
            <p style="font-size:0.84rem;line-height:1.4;margin-bottom:4px;">“${escapeHtml(fb.comment)}”</p>
            <div style="font-size:0.74rem;color:var(--verified-text);font-weight:700;">🏷️ Xác nhận giá: ${escapeHtml(fb.verifiedPrice || 'Đúng giá')}</div>
          </div>
        `
        )
        .join('')}
    </div>

    <form class="feedback-form-box" id="formAddFeedback" data-restaurant-id="${restaurant.id}">
      <h4 style="font-size:0.88rem;">✍️ Gửi Feedback & Xác minh giá thực tế</h4>
      <input type="text" name="author" class="form-input-field" placeholder="Tên của bạn (VD: Minh Quân)" required />
      <div style="display:flex;gap:8px;">
        <select name="rating" class="form-input-field" style="width:45%;">
          <option value="5">⭐⭐⭐⭐⭐ (5 sao)</option>
          <option value="4">⭐⭐⭐⭐ (4 sao)</option>
          <option value="3">⭐⭐⭐ (3 sao)</option>
        </select>
        <input type="text" name="verifiedPrice" class="form-input-field" placeholder="Giá thực tế (VD: 45k đúng giá)" />
      </div>
      <textarea name="comment" rows="2" class="form-textarea-field" placeholder="Chia sẻ cảm nhận về món ăn, nước dùng, chỗ để xe..." required></textarea>
      <button type="submit" class="btn-cta-primary" style="width:100%;">Gửi đánh giá lên hệ thống</button>
    </form>
  `;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
