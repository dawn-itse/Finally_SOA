/**
 * UI Component Renderers for "Mua Gì Đây" Frontend (ERD-Compliant + Exact Screenshot Menu Pane)
 */

import { FoodIllustrations, getDishIllustration } from './svgIcons.js';
import { formatK } from '../demo/nlpParser.js';

const ICON_ROUTE = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="6" cy="19" r="3"></circle><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"></path><circle cx="18" cy="5" r="3"></circle></svg>`;
const ICON_FORK_KNIFE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"></path></svg>`;
const ICON_PHONE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
const ICON_BIKE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5.5" cy="17.5" r="3.5"></circle><circle cx="18.5" cy="17.5" r="3.5"></circle><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"></path></svg>`;

export function formatDistance(distanceKm) {
  const km = Number(distanceKm) || 0;
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1).replace('.0', '').replace('.', ',')}km`;
}

function describeAnchor(anchor) {
  if (anchor?.source === 'GPS') return 'vị trí của bạn';
  return anchor ? `mốc ${anchor.label}` : 'điểm tìm kiếm';
}

function formatTravelDistance(place) {
  const anchor = escapeHtml(describeAnchor(place.searchAnchor));
  return place.routeDistanceKm === undefined
    ? `${formatDistance(place.distanceKm)} từ ${anchor} (đường chim bay)`
    : `${formatDistance(place.routeDistanceKm)} từ ${anchor} theo đường đi`;
}

function hasPriceRange(place) {
  return place.effectiveMaxPrice > place.effectiveMinPrice;
}

function formatStartingPrice(place) {
  return `${hasPriceRange(place) ? 'Từ ' : ''}${formatK(place.effectiveMinPrice)}`;
}

function formatLeftover(place) {
  if (place.leftoverAmount <= 0) return hasPriceRange(place) ? '' : 'vừa khít ngân sách';
  return `${hasPriceRange(place) ? 'dư tối đa' : 'dư'} ${formatK(place.leftoverAmount)}`;
}

export function formatPhoneDisplay(phone) {
  const digits = String(phone || '0904158156').replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return phone || '0904 158 156';
}

function computeEtaTimeStr(travelMinutes) {
  const now = new Date();
  now.setMinutes(now.getMinutes() + (Number(travelMinutes) || 7));
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function computeWalkingMinutes(distanceKm) {
  return Math.max(4, Math.round(((Number(distanceKm) || 0.9) / 4.5) * 60));
}

/**
 * Render Restaurant Verification Status Badge (ONLY 2 display states)
 * - isVerified = true  -> "✓ Đã xác minh"
 * - isVerified = false -> "Chưa xác minh"
 */
export function renderRestaurantVerificationBadge(isVerified) {
  return isVerified
    ? `<span class="verified-badge">✓ Đã xác minh</span>`
    : `<span class="unverified-badge">Chưa xác minh</span>`;
}

function formatMenuItemPriceRange(item) {
  if (!item || item.minPrice === null || item.minPrice === undefined) {
    return 'No price';
  }
  if (item.maxPrice && item.maxPrice > item.minPrice) {
    return `${formatK(item.minPrice)} - ${formatK(item.maxPrice)}`;
  }
  return formatK(item.minPrice);
}

/**
 * Screen 1: Home Weather & Floating Food Illustration Greeting
 */
export function renderHomeHero(weatherContext) {
  const weatherTime = new Date(weatherContext.fetchedAt);
  const weatherLabel = weatherContext.weatherSource === 'meteosource' && Number.isFinite(weatherTime.getTime())
    ? `Meteosource · Lấy lúc ${weatherTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
    : 'Dữ liệu mẫu';
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

      <h1 class="hero-question-title">Bạn muốn ăn món gì?</h1>

      <div class="weather-badge-line">
        <span>${weatherContext.temp}° · ${escapeHtml(weatherContext.condition)} · ${weatherLabel}</span>
      </div>

      <p class="weather-context-quote" id="btnWeatherSuggestion" title="Nhấn để thử gợi ý này">
        ${escapeHtml(weatherContext.suggestionQuote)}
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
        <div class="bot-bubble">Bạn muốn ăn món gì?</div>
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
  const { dish, budget, radiusKm, viewMode, sortBy, partySize, favorites } = state;
  const { totalMatchedCount, heroRestaurant, nearbyOthers, searchAnchor, suggestions = [], discoveryStatus } = state.searchResults;
  const range = `trong ${radiusKm} km từ ${describeAnchor(searchAnchor)} (đường chim bay)`;

  if (!heroRestaurant) {
    return `
      <div class="results-container">
        <p class="bot-bubble">Chưa tìm thấy quán trong catalog có ${escapeHtml(dish)} với giá tối đa ${formatK(budget)} ${escapeHtml(range)}.</p>
        ${discoveryStatus === 'searching' ? '<p class="discovery-status" role="status">Đang tìm thêm địa điểm qua Goong…</p>' : ''}
        ${discoveryStatus === 'unavailable' ? '<p class="discovery-status" role="status">Chưa thể tìm thêm địa điểm qua Goong. Bạn có thể đổi bộ lọc hoặc thử lại.</p>' : ''}
        ${discoveryStatus === 'empty' ? '<p class="discovery-status" role="status">Không có địa điểm gợi ý trong bán kính này. Bạn có thể đổi bộ lọc.</p>' : ''}
        ${suggestions.length ? renderDiscoverySuggestions(suggestions) : ''}
        <button type="button" class="btn-add-place-inline" data-action="open-add-restaurant-modal">Đề xuất quán</button>
      </div>
    `;
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
            <p>${totalMatchedCount} quán vừa tiền ${escapeHtml(range)}</p>
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
          : renderHeroCardAndNearbyList(heroRestaurant, nearbyOthers, favorites, partySize, radiusKm)
      }
    </div>
  `;
}

function renderDiscoverySuggestions(places) {
  return `
    <section class="discovery-section" aria-label="Địa điểm gợi ý từ Goong">
      <h3>Địa điểm gợi ý từ Goong</h3>
      <p>Chưa xác nhận món và giá</p>
      <ul class="discovery-list">
        ${places.map((place) => {
          const map = new URL('https://www.google.com/maps/search/');
          map.search = new URLSearchParams({ api: '1', query: `${place.latitude},${place.longitude}` });
          return `
            <li class="discovery-card">
              <div>
                <strong>${escapeHtml(place.name)}</strong>
                <p>${escapeHtml(place.address)}</p>
                <p>${formatDistance(place.distanceKm)} · Đường chim bay</p>
              </div>
              <a class="btn-add-place-inline" href="${escapeHtml(map.href)}" target="_blank" rel="noopener noreferrer">Xem trên bản đồ</a>
            </li>
          `;
        }).join('')}
      </ul>
    </section>
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
  const leftover = place.leftoverAmount > 0 ? `<span class="price-leftover">${formatLeftover(place)}</span>` : '';
  return `
    <div class="mini-card-price">
      <div class="price-main">${formatStartingPrice(place)}</div>
      ${leftover}
    </div>
  `;
}

function renderEndOfListAddPlaceFooter(radiusKm) {
  return `
    <div class="list-end-add-place">
      <p class="list-end-muted">Đã hết quán phù hợp trong ${escapeHtml(radiusKm)}km.</p>
      <p class="list-end-cta">
        Thiếu quán bạn biết quanh đây?
        <button type="button" class="btn-add-place-inline" data-action="open-add-restaurant-modal">
          Thêm quán
        </button>
      </p>
    </div>
  `;
}

/**
 * Hero Restaurant Card + Secondary Nearby Section (Screens 6 & 7)
 */
function renderHeroCardAndNearbyList(hero, nearbyOthers, favorites, partySize, radiusKm = 2) {
  const isFav = favorites.has(hero.id);
  const isWalk = hero.transportMode === 'WALKING';
  const travelIcon = isWalk ? '🚶' : '🛵';
  const travelLabel = isWalk ? 'phút đi bộ' : 'phút đi xe';
  const leftover = formatLeftover(hero);
  const leftoverBadge = leftover ? `<span class="budget-leftover-pill">${leftover}</span>` : '';

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
          <span style="color:#1D5BD6;">${travelIcon}</span>
          <span>${hero.routeDistanceKm === undefined ? '~' : ''}${hero.travelMinutes} ${travelLabel}</span>
        </div>

        <div class="minimap-top-actions">
          <button class="btn-circle-icon ${isFav ? 'favorited' : ''}" data-action="toggle-fav" data-id="${hero.id}" title="Lưu quán yêu thích">
            ${isFav ? '♥' : '♡'}
          </button>
          <button class="btn-circle-icon" data-action="open-more-menu" data-id="${hero.id}" title="Tuỳ chọn khác">
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
          ${renderRestaurantVerificationBadge(hero.isVerified)}
        </div>

        <h2 class="restaurant-title">${escapeHtml(hero.name)}</h2>

        <div class="restaurant-meta-line">
          <span>${escapeHtml(hero.categoryLabel)}</span>
          <span>·</span>
          <span>${formatTravelDistance(hero)}</span>
          <span>·</span>
          <span>${travelIcon} ${hero.travelMinutes} phút</span>
          <span>·</span>
          <span class="open-status-green">Mở tới ${hero.openUntil}</span>
        </div>

        <div class="restaurant-address-line">${escapeHtml(hero.address)}</div>

        <!-- Price & Leftover Budget Row -->
        <div class="price-budget-row">
          ${
            hero.effectiveMinPrice !== null && hero.effectiveMinPrice !== undefined
              ? `
                <div class="price-tag-main">
                  ${hasPriceRange(hero) ? '<span>từ</span>' : ''}
                  <strong>${formatK(hero.effectiveMinPrice)}</strong>
                </div>
                ${leftoverBadge}
                ${partyBadge}
              `
              : `<div class="price-tag-main"><strong>No price</strong></div>`
          }
        </div>

        <!-- Rating & Featured Review Quote -->
        <div class="rating-summary-line" data-action="open-erd-feedback-modal" data-id="${hero.id}">
          <span style="color:#F59E0B;">⭐</span>
          <strong>${hero.rating.toFixed(1).replace('.', ',')}</strong>
          <span>· ${hero.reviewCount} đánh giá</span>
          ${hero.rating >= 4.5 ? `<span class="high-rating-badge">Khách chấm cao</span>` : ''}
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
                ${escapeHtml(item.name)} <strong>${formatMenuItemPriceRange(item)}</strong>
              </span>
            `
            )
            .join('')}
        </div>

        <!-- Action Buttons: Chỉ đường, Menu & Gọi -->
        <div class="card-cta-row">
          <button class="btn-cta-primary" data-action="open-directions" data-id="${hero.id}">
            ${ICON_ROUTE}
            Chỉ đường
          </button>
          <button class="btn-cta-secondary" data-action="open-menu" data-id="${hero.id}">
            ${ICON_FORK_KNIFE} Menu
          </button>
          <a class="btn-cta-call" href="tel:${escapeHtml(hero.phone || '0904158156')}">
            ${ICON_PHONE} Gọi
          </a>
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
            .map((place) => {
              const placeTravelLabel = place.transportMode === 'WALKING' ? 'phút đi bộ' : 'phút đi xe';
              return `
              <div class="nearby-mini-card" data-action="promote-hero" data-id="${place.id}">
                <div class="mini-card-thumb">
                  ${getDishIllustration(place.categoryLabel, 42)}
                </div>
                <div class="mini-card-info">
                  <div class="mini-card-title">${escapeHtml(place.name)}</div>
                  <div class="mini-card-sub">
                    ${formatTravelDistance(place)} · ${place.routeDistanceKm === undefined ? '~' : ''}${place.travelMinutes} ${placeTravelLabel}
                  </div>
                </div>
                ${renderMiniCardPrice(place)}
              </div>
            `;
            })
            .join('')}
        </div>

        <button class="btn-expand-more-places" id="btnOpenExplorerMore">
          + Xem tất cả quán quanh bạn
        </button>
        ${renderEndOfListAddPlaceFooter(radiusKm)}
      </div>
    `
        : renderEndOfListAddPlaceFooter(radiusKm)
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
            🍴 ${escapeHtml(p.name.split('-')[0].trim())} · ${formatStartingPrice(p)}
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
              ${idx === 0 ? '<div class="comparison-tag">Đang chọn</div>' : ''}
              <div class="mini-card-title">${escapeHtml(place.name)}</div>
              <div class="mini-card-sub">${formatTravelDistance(place)} · ${place.routeDistanceKm === undefined ? '~' : ''}${place.travelMinutes} phút ${place.transportMode === 'WALKING' ? 'đi bộ' : 'đi xe'}</div>
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
 * Full Places Explorer ("Quán quanh bạn") — Matches user's screenshot 1:1
 */
export function renderPlacesExplorer(state, selectedMenuId) {
  const { dish, budget, radiusKm, sortBy, favorites } = state;
  const results = state.searchResults;
  const places = results ? [results.heroRestaurant, ...results.nearbyOthers].filter(Boolean) : [];
  const selected = places.find((p) => p.id === selectedMenuId) ?? places[0];
  const activeMenuId = selected?.id ?? null;

  return `
    <div class="explorer-header">
      <div class="explorer-header-top">
        <div>
          <h2 class="explorer-title">Quán quanh điểm tìm</h2>
          <p class="explorer-subtitle">${escapeHtml(dish || 'Phở')} · tối đa ${formatK(budget)} · trong ${radiusKm} km từ ${escapeHtml(describeAnchor(results?.searchAnchor))}</p>
        </div>
        <button class="btn-close-modal" data-action="close-explorer" title="Đóng">✕</button>
      </div>
      ${renderSortChips(sortBy)}
    </div>

    <div class="explorer-body">
      <div class="explorer-list">
        ${places.map((p, idx) => renderExplorerPlaceCard(p, favorites, p.id === activeMenuId, idx)).join('')}
        ${renderEndOfListAddPlaceFooter(radiusKm)}
      </div>
      <aside class="explorer-detail-pane">
        ${
          selected
            ? renderCleanMenuDetailPane(selected)
            : `
          <div class="pane-placeholder">
            ${ICON_FORK_KNIFE}
            <span>Bấm "Menu" ở một quán để xem thực đơn và giá ở đây.</span>
          </div>
        `
        }
      </aside>
    </div>
  `;
}

/**
 * Explorer Left-Column Card — Matches screenshot card layout:
 * - Verified badge on top
 * - Name + "Gợi ý" pill
 * - Meta line: Quán phở · 900m · 🛵 7 phút · Mở tới 21:00 · 🕒 Đã chọn trước đây
 * - Price + dư Xk + ♡ and ⋯ on right
 * - ⭐ 4,3 · 34 đánh giá + "Khách chấm cao" + review quote
 * - Dish price chip
 * - [Chỉ đường] [🍴 Menu] [📞 Gọi]
 */
function renderExplorerPlaceCard(place, favorites, isActive, idx = 0) {
  const isFav = favorites.has(place.id);
  const openText = place.openUntil === '24:00' ? 'Mở cả ngày' : `Mở tới ${escapeHtml(place.openUntil)}`;
  const showChosenBefore = isFav || idx === 1;
  const showHighRating = place.rating >= 4.2 && place.reviewCount >= 10;

  return `
    <article class="explorer-card ${isActive ? 'active' : ''}" data-id="${place.id}">
      <div class="explorer-card-head">
        <div class="mini-card-thumb">${getDishIllustration(place.categoryLabel, 44)}</div>
        <div class="explorer-card-info">
          <div class="explorer-top-badge-line">
            ${renderRestaurantVerificationBadge(place.isVerified)}
          </div>
          <div class="explorer-title-row">
            <h3>${escapeHtml(place.name)}</h3>
            <span class="badge-suggest">Gợi ý</span>
          </div>
          <div class="restaurant-meta-line">
            <span>${escapeHtml(place.categoryLabel)}</span><span>·</span>
            <span>${formatTravelDistance(place)}</span><span>·</span>
            <span class="meta-bike-icon">${ICON_BIKE} ${place.travelMinutes} phút</span><span>·</span>
            <span class="open-status-green">${openText}</span>
            ${showChosenBefore ? `<span>·</span><span class="chosen-before-tag">🕒 Đã chọn trước đây</span>` : ''}
          </div>
          <div class="restaurant-address-line">${escapeHtml(place.address)}</div>
        </div>
      </div>

      <div class="explorer-price-row">
        <div class="explorer-price"><strong>${formatStartingPrice(place)}</strong></div>
        ${place.leftoverAmount > 0 ? `<span class="budget-leftover-pill">${formatLeftover(place)}</span>` : ''}
        <div class="explorer-card-icons">
          <button class="btn-ghost-icon ${isFav ? 'favorited' : ''}" data-action="toggle-fav" data-id="${place.id}" title="Lưu quán yêu thích">${isFav ? '♥' : '♡'}</button>
          <button class="btn-ghost-icon" data-action="open-more-menu" data-id="${place.id}" title="Tuỳ chọn khác">⋯</button>
        </div>
      </div>

      <div class="explorer-rating-block">
        <div class="explorer-rating-line" data-action="open-erd-feedback-modal" data-id="${place.id}">
          <span style="color:#F59E0B;">⭐</span>
          <strong>${place.rating.toFixed(1).replace('.', ',')}</strong>
          <span>· ${place.reviewCount} đánh giá</span>
          ${showHighRating ? `<span class="high-rating-badge">Khách chấm cao</span>` : ''}
        </div>
        ${
          idx > 0 && place.featuredReview
            ? `
          <blockquote class="explorer-review-quote">
            “${escapeHtml(place.featuredReview.quote)}”
            <span class="quote-author">– khách chấm ${place.featuredReview.rating}★ · ${place.featuredReview.date}</span>
          </blockquote>
        `
            : ''
        }
      </div>

      <div class="matched-dishes-row">
        ${(place.matchedMenu || place.menu)
          .slice(0, 2)
          .map((item) => `<span class="dish-price-chip">${escapeHtml(item.name)} <strong>${formatMenuItemPriceRange(item)}</strong></span>`)
          .join('')}
      </div>

      <div class="card-cta-row">
        <button class="btn-cta-primary" data-action="open-directions" data-id="${place.id}">
          ${ICON_ROUTE}
          Chỉ đường
        </button>
        <button class="btn-cta-secondary ${isActive ? 'is-active-menu' : ''}" data-action="explorer-menu" data-id="${place.id}">
          ${ICON_FORK_KNIFE} Menu
        </button>
        <a class="btn-cta-call" href="tel:${escapeHtml(place.phone || '0904158156')}">
          ${ICON_PHONE} Gọi
        </a>
      </div>
    </article>
  `;
}

/**
 * Right-hand Detail Pane (and Mobile Menu View) matching the screenshot 1:1:
 * - Title: Phở Sang Bò & Gà Phú thuận - Q7
 * - Meta 1: Quán phở · 900m
 * - Meta 2: 7 phút đi xe (đi bộ 15 phút) · tới nơi 21:46 · mở cả ngày
 * - Active line: ✓ Quán còn hoạt động · 3,4★ (17 đánh giá)
 * - Clean menu list with first matching dish highlighted in green with ✓
 * - CTA buttons: [Chỉ đường] [📞 Gọi 0703 394 285]
 * - Underlined links: Sai giá · Đánh giá · Đóng góp / Sửa quán
 */
export function renderCleanMenuDetailPane(restaurant) {
  const walkMin = computeWalkingMinutes(restaurant.distanceKm);
  const etaStr = computeEtaTimeStr(restaurant.travelMinutes);
  const openText = restaurant.openUntil === '24:00' ? 'mở cả ngày' : `mở tới ${escapeHtml(restaurant.openUntil)}`;

  const bestMatchItem = restaurant.matchedMenu?.[0];

  return `
    <div class="clean-menu-pane">
      <div style="margin-bottom:6px;">
        ${renderRestaurantVerificationBadge(restaurant.isVerified)}
      </div>
      <h3 class="pane-restaurant-title">${escapeHtml(restaurant.name)}</h3>
      <div class="pane-meta-sub">${escapeHtml(restaurant.categoryLabel)} · ${formatTravelDistance(restaurant)}</div>
      <div class="pane-meta-sub">
        ${restaurant.travelMinutes} phút ${restaurant.transportMode === 'WALKING' ? 'đi bộ' : `đi xe (ước tính đi bộ ${walkMin} phút)`} · tới nơi ${etaStr} · ${openText}
      </div>

      <div class="pane-active-green">
        ✓ Quán còn hoạt động · ${restaurant.rating.toFixed(1).replace('.', ',')}★ (${restaurant.reviewCount} đánh giá)
      </div>

      <div class="pane-clean-menu-list">
        ${restaurant.menu
          .map((item) => {
            const isHighlighted = bestMatchItem && item.menu_item_id === bestMatchItem.menu_item_id;
            const priceLabel = formatMenuItemPriceRange(item);
            return `
              <div class="pane-clean-menu-row ${isHighlighted ? 'is-featured-dish' : ''}">
                <div class="pane-dish-name">
                  ${isHighlighted ? `<span class="pane-dish-check">✓</span>` : ''}
                  <span>${escapeHtml(item.name)}</span>
                </div>
                <div class="pane-dish-price">${escapeHtml(priceLabel)}</div>
              </div>
            `;
          })
          .join('')}
      </div>

      <div class="pane-cta-buttons">
        <button class="btn-cta-primary" data-action="open-directions" data-id="${restaurant.id}">
          ${ICON_ROUTE}
          Chỉ đường
        </button>
        <a class="btn-cta-call-phone" href="tel:${escapeHtml(restaurant.phone || '0904158156')}">
          ${ICON_PHONE}
          Gọi ${escapeHtml(formatPhoneDisplay(restaurant.phone))}
        </a>
      </div>

      <div class="pane-bottom-links">
        <button type="button" class="btn-underlined-muted" data-action="open-wrong-price-modal" data-id="${restaurant.id}">
          Sai giá
        </button>
        <span class="links-dot">·</span>
        <button type="button" class="btn-underlined-muted" data-action="open-erd-feedback-modal" data-id="${restaurant.id}">
          Đánh giá (${restaurant.reviewCount})
        </button>
        <span class="links-dot">·</span>
        <button type="button" class="btn-underlined-muted" data-action="open-contrib-for-restaurant" data-id="${restaurant.id}">
          Đóng góp / Sửa quán
        </button>
      </div>
    </div>
  `;
}

/**
 * Clean Menu Modal (When clicking "Menu" on mobile or compact view — matches screenshot!)
 */
export function renderCleanMenuModal(restaurant) {
  return `
    <div class="modal-handle"></div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:4px;">
      <button class="btn-close-modal" id="btnCloseModal">✕</button>
    </div>
    ${renderCleanMenuDetailPane(restaurant)}
  `;
}

/**
 * Reviews-only Modal: Displays restaurant reviews and the review submission form (REVIEW).
 */
export function renderMenuAndFeedbackModal(restaurant, session = null) {
  const isSignedIn = Boolean(session?.currentUser);
  const disabledAttr = isSignedIn ? '' : 'disabled title="Cần đăng nhập"';

  return `
    <div class="modal-handle"></div>
    <div class="modal-header">
      <div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:2px;">
          <div class="modal-title">${escapeHtml(restaurant.name)}</div>
          ${renderRestaurantVerificationBadge(restaurant.isVerified)}
        </div>
        <div style="font-size:0.78rem;color:var(--text-secondary);">
          ${escapeHtml(restaurant.address)} · ⭐ ${restaurant.rating.toFixed(1).replace('.', ',')} (${restaurant.reviewCount} đánh giá)
        </div>
      </div>
      <button class="btn-close-modal" id="btnCloseModal">✕</button>
    </div>
    ${renderSessionBar(session, { rerender: 'feedback', restaurantId: restaurant.id })}

    <h4 style="font-size:0.9rem;margin-bottom:8px;">
      💬 Đánh giá trải nghiệm quán (${restaurant.reviewCount})
    </h4>
    <div class="feedback-list">
      ${
        (restaurant.reviews || []).length === 0
          ? `<div class="feedback-card-item" style="font-size:0.82rem;color:var(--text-muted);">Chưa có đánh giá nào cho quán này.</div>`
          : restaurant.reviews
              .map(
                (rev) => `
          <div class="feedback-card-item">
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px;">
              <strong>👤 ${escapeHtml(rev.author)} · <span style="color:#F59E0B;">${'★'.repeat(rev.rating)}</span></strong>
              <span style="color:var(--text-muted);">${escapeHtml(rev.date)}</span>
            </div>
            <p style="font-size:0.84rem;line-height:1.4;">“${escapeHtml(rev.body)}”</p>
          </div>
        `
              )
              .join('')
      }
    </div>

    <form class="feedback-form-box" id="formAddReview" data-restaurant-id="${restaurant.id}">
      <h4 style="font-size:0.88rem;">✍️ Gửi Đánh Giá Quán</h4>
      <div style="display:flex;gap:8px;">
        <select name="rating" class="form-input-field" style="flex:1;">
          <option value="5">⭐⭐⭐⭐⭐ (5 sao)</option>
          <option value="4">⭐⭐⭐⭐ (4 sao)</option>
          <option value="3">⭐⭐⭐ (3 sao)</option>
          <option value="2">⭐⭐ (2 sao)</option>
          <option value="1">⭐ (1 sao)</option>
        </select>
      </div>
      <textarea name="comment" rows="2" class="form-textarea-field" placeholder="Chia sẻ cảm nhận về món ăn, nước dùng, chỗ để xe..." required></textarea>
      <button type="submit" class="btn-cta-primary" style="width:100%;" ${disabledAttr}>${isSignedIn ? 'Gửi đánh giá' : 'Đăng nhập để gửi đánh giá'}</button>
    </form>
  `;
}

/**
 * Dedicated Wrong Price Report Modal (opened from "Giá không đúng" in the "⋯" menu)
 */
export function renderWrongPriceReportModal(restaurant, session = null) {
  const isSignedIn = Boolean(session?.currentUser);
  const disabledAttr = isSignedIn ? '' : 'disabled title="Cần đăng nhập"';

  return `
    <div class="modal-handle"></div>
    <div class="modal-header">
      <div>
        <div class="modal-title">Báo cáo sai thông tin giá</div>
        <div style="font-size:0.78rem;color:var(--text-secondary);">
          ${escapeHtml(restaurant.name)} · ${escapeHtml(restaurant.address)}
        </div>
      </div>
      <button class="btn-close-modal" id="btnCloseModal">✕</button>
    </div>
    ${renderSessionBar(session, { rerender: 'price-report', restaurantId: restaurant.id })}

    <form class="feedback-form-box" id="formAddPriceReport" data-restaurant-id="${restaurant.id}">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <select name="menuItemId" class="form-input-field" style="flex:1;min-width:180px;" required>
          ${restaurant.menu
            .map(
              (m) => `
              <option value="${m.menu_item_id}" data-current-price="${m.minPrice ?? ''}">
                ${escapeHtml(m.name)} — Giá đang hiển thị: ${formatMenuItemPriceRange(m)}
              </option>
            `
            )
            .join('')}
        </select>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input type="number" name="observedPrice" class="form-input-field" style="flex:1;min-width:140px;" placeholder="Giá đúng bạn thấy (tuỳ chọn, VD: 50000)" min="0" step="1000" />
        <input type="url" name="evidenceUri" class="form-input-field" style="flex:1;min-width:140px;" placeholder="Link ảnh minh chứng nếu có (bảng giá/hóa đơn)" />
      </div>
      <input type="text" name="comment" class="form-input-field" placeholder="Ghi chú thêm về giá (tuỳ chọn)..." />
      <p style="font-size:0.72rem;color:var(--text-muted);margin:0;">
        Tự động phân loại <strong>WRONG_PRICE</strong> (món đã có giá) hoặc <strong>MISSING_PRICE</strong> (món đang No price) kèm minh chứng (nếu có) gửi về Admin xác minh trước khi cập nhật.
      </p>
      <button type="submit" class="btn-cta-primary" style="width:100%;" ${disabledAttr}>${isSignedIn ? 'Gửi báo cáo sai giá cho Admin' : 'Đăng nhập để gửi báo cáo sai giá'}</button>
    </form>
  `;
}

/**
 * Dedicated Add New Restaurant Modal (opened from "Thêm quán" at the end of the restaurant list)
 */
export function renderAddRestaurantModal(session = null) {
  const isSignedIn = Boolean(session?.currentUser);
  const disabledAttr = isSignedIn ? '' : 'disabled title="Cần đăng nhập"';

  return `
    <div class="modal-handle"></div>
    <div class="modal-header">
      <div>
        <div class="modal-title">Thêm quán mới</div>
        <div style="font-size:0.78rem;color:var(--text-secondary);">
          Thông tin quán sẽ được gửi về Admin xác minh chính xác rồi chỉnh sửa lại để hiển thị.
        </div>
      </div>
      <button class="btn-close-modal" id="btnCloseModal">✕</button>
    </div>
    ${renderSessionBar(session, { rerender: 'add-restaurant' })}

    <form class="feedback-form-box" id="formAddNewRestaurant">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <input type="text" name="proposedName" class="form-input-field" placeholder="Tên quán *" required />
        <div>
          <input type="text" name="proposedAddress" class="form-input-field" data-goong-address autocomplete="off" aria-label="Địa chỉ quán" maxlength="200" placeholder="Địa chỉ quán *" required />
          <div class="geo-address-options" data-goong-options aria-live="polite"></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <input type="text" name="dishName" class="form-input-field" placeholder="Món chính (VD: Phở bò)" />
        <input type="number" name="dishPrice" class="form-input-field" placeholder="Giá món (tuỳ chọn, trống = No price)" min="1000" step="1000" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <input type="url" name="evidenceUri" class="form-input-field" placeholder="Link ảnh quán / menu (nếu có)" />
        <input type="text" name="note" class="form-input-field" placeholder="Ghi chú thêm (giờ mở cửa, SĐT...)" />
      </div>
      <button type="submit" class="btn-cta-primary" style="width:100%;" ${disabledAttr}>
        ${isSignedIn ? 'Gửi quán mới cho Admin xác minh' : 'Đăng nhập để thêm quán'}
      </button>
    </form>
  `;
}

export function renderSessionBar(session, { rerender = 'feedback', restaurantId = '' } = {}) {
  const user = session?.currentUser;
  return `
    <div class="session-bar ${user ? 'signed-in' : 'guest'}" data-rerender="${rerender}" data-restaurant-id="${escapeHtml(restaurantId)}">
      <div class="session-bar-text">${user ? `Tài khoản <strong>${escapeHtml(user.display_name)}</strong>` : 'Bạn đang dùng ở chế độ Khách.'}</div>
      ${user ? `
        <form data-auth-action="logout">
          <button type="submit" class="btn-pill-header">Đăng xuất</button>
        </form>
      ` : `
        <details class="auth-option">
          <summary>Đăng nhập</summary>
          <form class="auth-form" data-auth-action="login">
            <label>Email <input type="email" name="email" class="form-input-field" maxlength="254" autocomplete="username" required></label>
            <label>Mật khẩu <input type="password" name="password" class="form-input-field" maxlength="128" autocomplete="current-password" required></label>
            <button type="submit" class="btn-pill-header">Đăng nhập</button>
          </form>
        </details>
        <details class="auth-option">
          <summary>Đăng ký</summary>
          <form class="auth-form" data-auth-action="register">
            <label>Tên hiển thị <input name="display_name" class="form-input-field" maxlength="80" autocomplete="name" required></label>
            <label>Email <input type="email" name="email" class="form-input-field" maxlength="254" autocomplete="email" required></label>
            <label>Mật khẩu (ít nhất 8 ký tự) <input type="password" name="password" class="form-input-field" minlength="8" maxlength="128" autocomplete="new-password" required></label>
            <button type="submit" class="btn-pill-header">Tạo tài khoản</button>
          </form>
        </details>
      `}
      <p class="auth-error" data-auth-error role="alert" hidden></p>
    </div>
  `;
}

const ICON_WALK_ORANGE = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F6A867" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="2"></circle><path d="M10 22l2-7-3-3 1-5 5 2 2 4"></path><path d="M8 12l-3 3"></path><path d="M14 15l2 7"></path></svg>`;
const ICON_BIKE_ORANGE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F6A867" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"></circle><circle cx="18.5" cy="17.5" r="3.5"></circle><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"></path></svg>`;

function getCategoryChipIllustration(iconKey) {
  switch (iconKey) {
    case 'pho':
      return FoodIllustrations.phoBowl(26);
    case 'com':
      return FoodIllustrations.ricePlate(28);
    case 'banhmi':
      return FoodIllustrations.banhMi(28);
    case 'hotpot':
      return FoodIllustrations.hotpot(26);
    case 'burger':
      return FoodIllustrations.burger(24);
    case 'coffee':
      return FoodIllustrations.icedCoffee(24);
    case 'bobatea':
      return FoodIllustrations.peachTea(24);
    case 'juice':
      return FoodIllustrations.juiceGlass(24);
    default:
      return FoodIllustrations.phoBowl(24);
  }
}

/**
 * Render Personalization Panel or Contribution Modal
 */
export function renderPersonalizationAndErdModal({
  activeTab = 'prefs',
  userPrefs,
  dietaryCatalog,
  dishCategoryCatalog,
  allRestaurants,
  preselectedRestaurantId = null,
  preselectedContribType = null,
  session = null
}) {
  if (activeTab === 'prefs') {
    return renderPersonalizationPanelExact({
      userPrefs,
      dietaryCatalog,
      dishCategoryCatalog,
      session
    });
  }

  return `
    <div class="modal-handle"></div>
    <div class="modal-header">
      <div>
        <div class="modal-title">Báo cáo hoặc Đóng góp cộng đồng</div>
      </div>
      <button class="btn-close-modal" id="btnCloseModal">✕</button>
    </div>

    ${renderSessionBar(session, { rerender: 'erd' })}

    ${renderContributionTabContent({
      allRestaurants,
      preselectedRestaurantId,
      preselectedContribType,
      session
    })}
  `;
}

/**
 * Exact 1:1 "Cá nhân hóa" Panel matching the user's 2 screenshots
 */
function renderPersonalizationPanelExact({ userPrefs, dietaryCatalog, dishCategoryCatalog, session }) {
  const selectedRestrictions = new Set(userPrefs.restriction_ids || []);
  const selectedDishes = new Set(userPrefs.favorite_dish_category_ids || []);
  const dietMode = userPrefs.diet_mode || null;
  const transportMode = userPrefs.transport_mode || 'FLEXIBLE';
  const savedRestaurants = userPrefs.saved_restaurants || [];
  const learnedStats = userPrefs.settings?.learned_stats || {
    searchCount: 17,
    chosenCount: 3,
    topCategory: 'phở, bún, mì'
  };

  return `
    <div class="personalize-panel-shell" id="personalizePanelForm">
      <!-- Fixed Header -->
      <div class="personalize-panel-header">
        <div class="personalize-header-top">
          <h2 class="personalize-main-title">Cá nhân hóa</h2>
          <button type="button" class="btn-close-modal" id="btnCloseModal" title="Đóng">✕</button>
        </div>
        <p class="personalize-main-desc">
          ${
            userPrefs.isGuest
              ? 'Cho mình biết gu của bạn để gợi ý đúng hơn. Chỉ lưu trên máy này, không lưu trên máy chủ.'
              : `Cho mình biết gu của bạn để gợi ý đúng hơn. Đã đồng bộ với ${escapeHtml(userPrefs.storageSource)}.`
          }
        </p>
      </div>

      <!-- Scrollable Body -->
      <div class="personalize-panel-body">
        ${renderSessionBar(session, { rerender: 'prefs' })}
        <!-- 1. Bạn không ăn được gì? chọn nhiều -->
        <section class="personalize-block">
          <div class="personalize-block-title">
            <strong>Bạn không ăn được gì?</strong>
            <span class="personalize-hint">chọn nhiều</span>
          </div>
          <div class="personalize-chips-group">
            ${dietaryCatalog
              .map((r) => {
                const isSelected = selectedRestrictions.has(r.restriction_id);
                return `
                  <button
                    type="button"
                    class="p-pill-chip ${isSelected ? 'selected' : ''}"
                    data-p-toggle="restriction"
                    data-id="${r.restriction_id}"
                  >
                    ${escapeHtml(r.name)}
                  </button>
                `;
              })
              .join('')}
          </div>
          <p class="personalize-helper-text">
            Mình bỏ quán, món có tên ghi rõ thứ đó. Gõ rõ món (VD "lẩu hải sản") thì mình tìm theo câu gõ.
          </p>
        </section>

        <!-- 2. Chế độ ăn -->
        <section class="personalize-block">
          <div class="personalize-block-title">
            <strong>Chế độ ăn</strong>
          </div>
          <div class="personalize-chips-group">
            <button
              type="button"
              class="p-pill-chip ${dietMode === 'VEGETARIAN' ? 'selected' : ''}"
              data-p-toggle="diet"
              data-value="VEGETARIAN"
            >
              Ăn chay
            </button>
            <button
              type="button"
              class="p-pill-chip ${dietMode === 'HEALTHY' ? 'selected' : ''}"
              data-p-toggle="diet"
              data-value="HEALTHY"
            >
              Ăn lành mạnh
            </button>
          </div>
          <p class="personalize-helper-text">
            Ăn chay: chỉ tìm quán chay, món chay. Ăn lành mạnh: ưu tiên salad, eat clean, nước ép; xếp sau đồ chiên rán, đồ ngọt.
          </p>
        </section>

        <!-- 3. Bạn thích món gì? chọn tối đa 3 -->
        <section class="personalize-block">
          <div class="personalize-block-title">
            <strong>Bạn thích món gì?</strong>
            <span class="personalize-hint">chọn tối đa 3</span>
          </div>
          <div class="personalize-chips-group">
            ${dishCategoryCatalog
              .map((c) => {
                const isSelected = selectedDishes.has(c.dish_category_id);
                return `
                  <button
                    type="button"
                    class="p-pill-chip p-pill-with-art ${isSelected ? 'selected' : ''}"
                    data-p-toggle="dish-cat"
                    data-id="${c.dish_category_id}"
                  >
                    <span class="p-pill-art">${getCategoryChipIllustration(c.icon_key)}</span>
                    <span>${escapeHtml(c.name)}</span>
                  </button>
                `;
              })
              .join('')}
          </div>
          <p class="personalize-helper-text">
            Bạn không nói món (VD "50k ăn gì") thì mình ưu tiên những món này.
          </p>
        </section>

        <!-- 4. Bạn hay đi bằng gì? -->
        <section class="personalize-block">
          <div class="personalize-block-title">
            <strong>Bạn hay đi bằng gì?</strong>
          </div>
          <div class="personalize-chips-group">
            <button
              type="button"
              class="p-pill-chip p-pill-with-icon ${transportMode === 'WALKING' ? 'selected' : ''}"
              data-p-toggle="transport"
              data-value="WALKING"
            >
              ${ICON_WALK_ORANGE}
              <span>Đi bộ</span>
            </button>
            <button
              type="button"
              class="p-pill-chip p-pill-with-icon ${transportMode === 'MOTORBIKE' ? 'selected' : ''}"
              data-p-toggle="transport"
              data-value="MOTORBIKE"
            >
              ${ICON_BIKE_ORANGE}
              <span>Xe máy</span>
            </button>
            <button
              type="button"
              class="p-pill-chip ${transportMode === 'FLEXIBLE' ? 'selected' : ''}"
              data-p-toggle="transport"
              data-value="FLEXIBLE"
            >
              Tuỳ lúc
            </button>
          </div>
          <p class="personalize-helper-text">
            Đi bộ thì mình tìm quán gần hơn và tính giờ đi bộ.
          </p>
        </section>

        <!-- 5. Quán bạn lưu, quán đã ẩn -->
        <section class="personalize-block">
          <div class="personalize-block-title">
            <strong>Quán bạn lưu, quán đã ẩn</strong>
          </div>
          <div class="personalize-saved-list">
            ${
              savedRestaurants.length > 0
                ? savedRestaurants
                    .map(
                      (r) => `
                  <div class="personalize-saved-row" data-saved-row="${r.restaurant_id}">
                    <div class="saved-restaurant-label">
                      <span class="saved-heart-pink">♥</span>
                      <span>${escapeHtml(r.name)}</span>
                    </div>
                    <button
                      type="button"
                      class="btn-unsave-orange"
                      data-action="unsave-fav-in-modal"
                      data-id="${r.restaurant_id}"
                    >
                      Bỏ lưu
                    </button>
                  </div>
                `
                    )
                    .join('')
                : `<p class="personalize-helper-text" style="margin-top:0;">Chưa có quán nào được lưu hoặc ẩn.</p>`
            }
          </div>
        </section>

        <!-- 6. Mình học được từ lựa chọn của bạn -->
        <section class="personalize-block personalize-learned-block">
          <div class="personalize-block-title">
            <strong>Mình học được từ lựa chọn của bạn</strong>
          </div>
          <p class="personalize-helper-text" style="margin-top:4px;margin-bottom:8px;">
            ${learnedStats.searchCount} lượt tìm · ${learnedStats.chosenCount} quán bạn đã chọn (bấm chỉ đường) · bạn hay chọn: ${escapeHtml(learnedStats.topCategory)}. Dùng để ưu tiên món bạn hay chọn khi bạn không nói món.
          </p>
          <button type="button" class="btn-clear-learned-orange" data-action="clear-learned-history">
            Xoá những gì mình đã học
          </button>
        </section>
      </div>

      <!-- Fixed Footer: Xoá thông tin | Lưu -->
      <div class="personalize-panel-footer">
        <button type="button" class="btn-personalize-reset" data-action="reset-personalization">
          Xoá thông tin
        </button>
        <button type="button" class="btn-personalize-save" data-action="save-personalization">
          Lưu
        </button>
      </div>
    </div>
  `;
}

function renderContributionTabContent({
  allRestaurants,
  preselectedRestaurantId,
  preselectedContribType,
  session = null
}) {
  const isSignedIn = Boolean(session?.currentUser);
  const allowedTypes = ['RESTAURANT_CORRECTION', 'MENU_CORRECTION', 'CLOSED_REPORT'];
  const defaultType = allowedTypes.includes(preselectedContribType)
    ? preselectedContribType
    : 'RESTAURANT_CORRECTION';

  return `
    <form id="formSubmitContribution" class="erd-card-section">
      <div class="erd-section-title">Gửi Đóng Góp Cộng Đồng (Bảng CONTRIBUTION)</div>
      <p style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:8px;">
        Báo quán đã đóng cửa, báo sai thông tin quán hoặc menu của quán đều được gửi về cho Admin xác minh chính xác rồi chỉnh sửa lại để hiển thị.
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div>
          <label style="font-size:0.74rem;font-weight:700;display:block;margin-bottom:3px;">Loại đóng góp</label>
          <select name="contributionType" class="form-input-field" required>
            <option value="RESTAURANT_CORRECTION" ${defaultType === 'RESTAURANT_CORRECTION' ? 'selected' : ''}>Sai thông tin quán (RESTAURANT_CORRECTION)</option>
            <option value="MENU_CORRECTION" ${defaultType === 'MENU_CORRECTION' ? 'selected' : ''}>Menu của quán (MENU_CORRECTION)</option>
            <option value="CLOSED_REPORT" ${defaultType === 'CLOSED_REPORT' ? 'selected' : ''}>Báo quán đã đóng cửa (CLOSED_REPORT)</option>
          </select>
        </div>
        <div>
          <label style="font-size:0.74rem;font-weight:700;display:block;margin-bottom:3px;">Quán liên quan</label>
          <select name="restaurantId" class="form-input-field" required>
            ${allRestaurants
              .map(
                (r, idx) => `
                <option value="${r.restaurant_id}" ${preselectedRestaurantId === r.restaurant_id || (!preselectedRestaurantId && idx === 0) ? 'selected' : ''}>
                  ${escapeHtml(r.name)}
                </option>
              `
              )
              .join('')}
          </select>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <input type="text" name="proposedName" class="form-input-field" placeholder="Tên quán sửa lại (nếu sai tên)" />
        <div>
          <input type="text" name="proposedAddress" class="form-input-field" data-goong-address autocomplete="off" aria-label="Địa chỉ quán sửa lại" maxlength="200" placeholder="Địa chỉ quán sửa lại (nếu sai)" />
          <div class="geo-address-options" data-goong-options aria-live="polite"></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <input type="text" name="dishName" class="form-input-field" placeholder="Tên món (khi sửa / bổ sung menu)" />
        <input type="number" name="dishPrice" class="form-input-field" placeholder="Giá món (tuỳ chọn, trống = No price)" min="1000" step="1000" />
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <input type="url" name="evidenceUri" class="form-input-field" placeholder="Link ảnh minh chứng (nếu có)" />
        <input type="text" name="note" class="form-input-field" placeholder="Ghi chú chi tiết gửi Admin..." />
      </div>

      <button type="submit" class="btn-cta-primary" style="width:100%;" ${isSignedIn ? '' : 'disabled title="Cần đăng nhập"'}>
        ${isSignedIn ? 'Gửi đóng góp cho Admin xác minh' : 'Đăng nhập để gửi đóng góp'}
      </button>
    </form>
  `;
}

const ICON_PRICE_WRONG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"></circle><path d="M15 9.2c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2.1s1.3 1.8 3 2.1 3 .9 3 2.1-1.3 2.1-3 2.1c-1.5 0-2.6-.6-3-1.6M12 6.2v1.5m0 8.6v1.5"></path></svg>`;
const ICON_FLAG_CONTRIB = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"></path><path d="M5 4h11l-1.5 4.5L16 13H5"></path></svg>`;

/**
 * Dark Popover Menu when clicking the "⋯" button on a restaurant card
 * Shows 2 options: "Giá không đúng" & "Báo cáo hoặc đóng góp"
 */
export function renderMoreActionsPopover(restaurantId) {
  return `
    <button type="button" class="more-menu-item" data-action="more-menu-wrong-price" data-id="${escapeHtml(restaurantId)}">
      <span class="more-menu-icon">${ICON_PRICE_WRONG}</span>
      <span class="more-menu-text">
        <span class="more-menu-title">Giá không đúng</span>
        <span class="more-menu-sub">Cho mình biết giá thật để sửa</span>
      </span>
    </button>
    <button type="button" class="more-menu-item" data-action="more-menu-contrib" data-id="${escapeHtml(restaurantId)}">
      <span class="more-menu-icon">${ICON_FLAG_CONTRIB}</span>
      <span class="more-menu-text">
        <span class="more-menu-title">Báo cáo hoặc đóng góp</span>
        <span class="more-menu-sub">Báo đóng cửa, sửa thông tin quán hoặc menu</span>
      </span>
    </button>
  `;
}

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
