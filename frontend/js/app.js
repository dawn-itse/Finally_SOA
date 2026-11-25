/**
 * Main Application State & Event Controller ("Mua Gì Đây" - ERD-Compatible)
 */

import { SOAApiClient, onServiceLog, emitServiceTrace, DB_STORAGE_KEY } from './services/apiClient.js';
import { parseUserUtterance, formatK } from './services/nlpParser.js';
import {
  renderHomeHero,
  renderConversationStream,
  renderCleanMenuModal,
  renderMenuAndFeedbackModal,
  renderWrongPriceReportModal,
  renderAddRestaurantModal,
  renderPlacesExplorer,
  renderPersonalizationAndErdModal,
  renderMoreActionsPopover
} from './components/renderers.js';

const appState = {
  step: 'HOME', // 'HOME' | 'ASK_BUDGET' | 'RESULTS'
  weatherIndex: 0,
  weatherContext: null,
  locations: SOAApiClient.getLocations(),
  currentLocationIndex: 0,
  currentLocationLabel: null,
  currentCoordinates: null,
  dish: null,
  budget: null,
  radiusKm: 2,
  partySize: 1,
  viewMode: 'list', // 'list' | 'map'
  sortBy: 'recommended', // 'recommended' | 'distance' | 'rating' | 'price'
  isScanning: false,
  messages: [],
  searchResults: null,
  favorites: new Set(),
  explorerOpen: false,
  explorerMenuId: null,
  erdPreselectedRestaurantId: null,
  erdPreselectedContribType: null
};

// DOM Elements
const appShellEl = document.querySelector('.app-shell');
const placesExplorerEl = document.getElementById('placesExplorer');
const desktopQuery = window.matchMedia('(min-width: 1024px)');
const viewportEl = document.getElementById('appMainViewport');
const searchInputEl = document.getElementById('dockSearchInput');
const btnSubmitSearchEl = document.getElementById('btnSubmitSearch');
const btnNewSearchHeaderEl = document.getElementById('btnNewSearchHeader');
const chipLocationLabelEl = document.getElementById('chipLocationLabel');
const dockFullAddressEl = document.getElementById('dockFullAddress');
const btnCurrentLocationEl = document.getElementById('btnCurrentLocation');
const currentLocationButtonLabelEl = document.getElementById('currentLocationButtonLabel');
const locationStatusEl = document.getElementById('locationStatus');
const chipBudgetBtnEl = document.getElementById('chipBudgetBtn');
const chipBudgetLabelEl = document.getElementById('chipBudgetLabel');
const chipRadiusLabelEl = document.getElementById('chipRadiusLabel');
const modalOverlayEl = document.getElementById('appModalOverlay');
const modalSheetEl = document.getElementById('appModalSheet');
const serviceLogBoxEl = document.getElementById('serviceLogBox');

let scanTimer = null;

function syncFavoritesFromPreferences() {
  const prefs = SOAApiClient.getUserPreferences();
  appState.favorites = new Set(prefs.favorite_restaurant_ids || []);
}

function runCurrentSearch() {
  return SOAApiClient.searchRestaurants({
    dish: appState.dish,
    budget: appState.budget,
    radiusKm: appState.radiusKm,
    sortBy: appState.sortBy,
    partySize: appState.partySize,
    coordinates: appState.currentCoordinates
  });
}

/**
 * Initialize Application
 */
function initApp() {
  onServiceLog(renderServiceLogs);
  syncFavoritesFromPreferences();
  appState.weatherContext = SOAApiClient.getWeatherGreeting(appState.weatherIndex);

  renderUI();
  bindGlobalEvents();
  startPlaceholderTypewriter();
}

/**
 * Render main viewport & sync bottom dock chips
 */
function renderUI() {
  syncFavoritesFromPreferences();
  const loc = appState.locations[appState.currentLocationIndex];
  const locationLabel = appState.currentLocationLabel || loc.fullAddress;
  chipLocationLabelEl.textContent = appState.currentLocationLabel ? 'Vị trí hiện tại' : loc.shortLabel;
  dockFullAddressEl.textContent = `Tìm quanh ${locationLabel}`;
  chipRadiusLabelEl.textContent = `${appState.radiusKm}km`;
  appShellEl.classList.toggle('is-home', appState.step === 'HOME');
  if (appState.explorerOpen) renderExplorer();

  if (appState.step === 'HOME') {
    btnNewSearchHeaderEl.style.display = 'none';
    chipBudgetBtnEl.style.display = 'none';
    btnSubmitSearchEl.classList.remove('circle-mode');
    btnSubmitSearchEl.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <span>Tìm quán</span>
    `;
    viewportEl.innerHTML = renderHomeHero(appState.weatherContext);
  } else {
    btnNewSearchHeaderEl.style.display = 'inline-flex';
    chipBudgetBtnEl.style.display = 'inline-flex';
    chipBudgetLabelEl.textContent = appState.budget ? formatK(appState.budget) : 'Số tiền';
    btnSubmitSearchEl.classList.add('circle-mode');
    btnSubmitSearchEl.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6">
        <line x1="12" y1="19" x2="12" y2="5"></line>
        <polyline points="5 12 12 5 19 12"></polyline>
      </svg>
    `;
    viewportEl.innerHTML = renderConversationStream(appState);
  }
}

/**
 * Handle User Query Submission (Natural Language or Chip)
 */
function handleUserQuery(rawInput) {
  const text = (rawInput || '').trim();
  if (!text) return;

  searchInputEl.value = '';
  if (scanTimer) clearTimeout(scanTimer);

  const parsed = parseUserUtterance(text, appState);
  emitServiceTrace('nlp-conversation-service', 'POST /api/v1/nlp/parse', parsed.explanation || `Input: "${text}"`);

  appState.messages.push({ sender: 'user', text });

  if (parsed.intent === 'REFINE_CHEAPER') {
    appState.budget = parsed.extractedBudget;
    appState.sortBy = 'price';
    triggerRadarThenResults(650);
    return;
  }

  if (parsed.intent === 'REFINE_CLOSER') {
    appState.radiusKm = parsed.extractedRadiusKm;
    appState.sortBy = 'distance';
    triggerRadarThenResults(650);
    return;
  }

  if (parsed.intent === 'REFINE_PARTY_SIZE') {
    appState.partySize = parsed.extractedPartySize;
    triggerRadarThenResults(500);
    return;
  }

  if (parsed.extractedDish) {
    appState.dish = parsed.extractedDish;
  }
  if (parsed.extractedBudget) {
    appState.budget = parsed.extractedBudget;
  }

  if (appState.dish && !appState.budget) {
    appState.step = 'SCANNING_FOR_SLOT';
    appState.isScanning = true;
    renderUI();
    scrollToBottom();

    scanTimer = setTimeout(() => {
      appState.isScanning = false;
      appState.step = 'ASK_BUDGET';
      appState.messages.push({
        sender: 'bot',
        text: `${appState.dish} nhé! Bạn muốn chi tối đa bao nhiêu tiền?`
      });
      renderUI();
      scrollToBottom();
    }, 900);
    return;
  }

  if (!appState.dish) {
    appState.dish = 'Phở bò';
  }
  if (!appState.budget) {
    appState.budget = 50000;
  }

  triggerRadarThenResults(1000);
}

function triggerRadarThenResults(delayMs = 950) {
  appState.step = 'RESULTS';
  appState.isScanning = true;
  renderUI();
  scrollToBottom();

  scanTimer = setTimeout(() => {
    appState.isScanning = false;
    appState.searchResults = runCurrentSearch();
    renderUI();
    scrollToResults();
  }, delayMs);
}

function scrollToResults() {
  requestAnimationFrame(() => {
    const el = viewportEl.querySelector('.results-container');
    if (!el) return scrollToBottom();
    const offset = el.getBoundingClientRect().top - viewportEl.getBoundingClientRect().top;
    viewportEl.scrollTop += offset - 12;
  });
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    viewportEl.scrollTop = viewportEl.scrollHeight;
  });
}

function startPlaceholderTypewriter() {
  const homeExamples = [
    'VD: 30k cà phê sữa',
    'VD: 30k bánh mì pate',
    'VD: 45k bún riêu cua',
    'VD: phở bò'
  ];
  const resultExamples = [
    'VD: đi 2 người',
    'VD: gần hơn',
    'VD: rẻ hơn',
    'VD: 25k xôi xéo'
  ];

  let exIndex = 0;
  let charIndex = 0;
  let deleting = false;

  setInterval(() => {
    if (document.activeElement === searchInputEl && searchInputEl.value.length > 0) {
      return;
    }
    const list = appState.step === 'RESULTS' ? resultExamples : homeExamples;
    const currentFull = list[exIndex % list.length];

    if (!deleting) {
      charIndex++;
      searchInputEl.setAttribute('placeholder', currentFull.slice(0, charIndex));
      if (charIndex >= currentFull.length) {
        deleting = true;
      }
    } else {
      charIndex--;
      searchInputEl.setAttribute('placeholder', currentFull.slice(0, Math.max(4, charIndex)));
      if (charIndex <= 4) {
        deleting = false;
        exIndex++;
      }
    }
  }, 130);
}

async function updateWeatherAtCoordinates(coordinates) {
  appState.weatherContext = await SOAApiClient.getWeatherForCoordinates(coordinates);
  if (appState.weatherContext.weatherSource !== 'weatherapi') {
    locationStatusEl.textContent = 'Đã có tọa độ, nhưng chưa lấy được thời tiết trực tiếp; đang dùng dữ liệu mẫu.';
  } else {
    locationStatusEl.textContent = 'Đã cập nhật thời tiết theo tọa độ thiết bị.';
  }
  renderUI();
}

function requestDeviceLocation() {
  if (!navigator.geolocation) {
    locationStatusEl.textContent = 'Trình duyệt này không hỗ trợ lấy vị trí.';
    return;
  }

  btnCurrentLocationEl.disabled = true;
  currentLocationButtonLabelEl.textContent = 'Đang định vị…';
  locationStatusEl.textContent = 'Đang yêu cầu quyền vị trí từ trình duyệt.';

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      appState.currentCoordinates = {
        latitude: coords.latitude,
        longitude: coords.longitude
      };
      appState.currentLocationLabel = 'Vị trí hiện tại';
      if (appState.step === 'RESULTS') {
        appState.searchResults = runCurrentSearch();
      }
      renderUI();

      try {
        await updateWeatherAtCoordinates(appState.currentCoordinates);
        const placeName = appState.weatherContext.location?.name;
        if (placeName) {
          appState.currentLocationLabel = `Vị trí hiện tại · ${placeName}`;
          renderUI();
        }
      } finally {
        btnCurrentLocationEl.disabled = false;
        currentLocationButtonLabelEl.textContent = 'Vị trí hiện tại';
      }
    },
    (error) => {
      const messages = {
        1: 'Bạn chưa cấp quyền vị trí. Hãy cho phép Location trong cài đặt trang web của trình duyệt.',
        2: 'Thiết bị chưa xác định được vị trí. Hãy bật dịch vụ vị trí rồi thử lại.',
        3: 'Lấy vị trí quá lâu. Hãy thử lại.'
      };
      locationStatusEl.textContent = messages[error.code] || 'Không lấy được vị trí thiết bị.';
      btnCurrentLocationEl.disabled = false;
      currentLocationButtonLabelEl.textContent = 'Vị trí hiện tại';
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 }
  );
}

/**
 * Shared handler for clicks inside Modal or Explorer Detail Pane
 */
function handleErdActionClick(e) {
  // A. Personalization Panel Chip Toggles (restriction, diet, dish-cat, transport)
  const toggleChip = e.target.closest('[data-p-toggle]');
  if (toggleChip) {
    const type = toggleChip.getAttribute('data-p-toggle');
    if (type === 'restriction') {
      toggleChip.classList.toggle('selected');
    } else if (type === 'diet') {
      const wasSelected = toggleChip.classList.contains('selected');
      modalSheetEl
        .querySelectorAll('[data-p-toggle="diet"]')
        .forEach((btn) => btn.classList.remove('selected'));
      if (!wasSelected) {
        toggleChip.classList.add('selected');
      }
    } else if (type === 'dish-cat') {
      if (toggleChip.classList.contains('selected')) {
        toggleChip.classList.remove('selected');
      } else {
        const currentSelected = modalSheetEl.querySelectorAll('[data-p-toggle="dish-cat"].selected');
        if (currentSelected.length < 3) {
          toggleChip.classList.add('selected');
        }
      }
    } else if (type === 'transport') {
      modalSheetEl
        .querySelectorAll('[data-p-toggle="transport"]')
        .forEach((btn) => btn.classList.remove('selected'));
      toggleChip.classList.add('selected');
    }
    return true;
  }

  // B. Unsave a favorite restaurant inside "Quán bạn lưu, quán đã ẩn"
  const unsaveFavBtn = e.target.closest('[data-action="unsave-fav-in-modal"]');
  if (unsaveFavBtn) {
    const restId = unsaveFavBtn.getAttribute('data-id');
    toggleFavorite(restId);
    renderUI();
    openPersonalizationModal('prefs');
    return true;
  }

  // C. Clear learned history ("Xoá những gì mình đã học")
  const clearLearnedBtn = e.target.closest('[data-action="clear-learned-history"]');
  if (clearLearnedBtn) {
    SOAApiClient.clearLearnedHistory();
    openPersonalizationModal('prefs');
    return true;
  }

  // D. Reset personalization ("Xoá thông tin")
  const resetPersonalizeBtn = e.target.closest('[data-action="reset-personalization"]');
  if (resetPersonalizeBtn) {
    SOAApiClient.clearAllPersonalization();
    syncFavoritesFromPreferences();
    if (appState.step === 'RESULTS') {
      appState.searchResults = runCurrentSearch();
    }
    renderUI();
    openPersonalizationModal('prefs');
    return true;
  }

  // E. Save personalization ("Lưu")
  const savePersonalizeBtn = e.target.closest('[data-action="save-personalization"]');
  if (savePersonalizeBtn) {
    const restrictionIds = Array.from(
      modalSheetEl.querySelectorAll('[data-p-toggle="restriction"].selected')
    ).map((el) => el.getAttribute('data-id'));

    const selectedDietEl = modalSheetEl.querySelector('[data-p-toggle="diet"].selected');
    const dietMode = selectedDietEl ? selectedDietEl.getAttribute('data-value') : null;

    const dishCatIds = Array.from(
      modalSheetEl.querySelectorAll('[data-p-toggle="dish-cat"].selected')
    ).map((el) => el.getAttribute('data-id'));

    const selectedTransportEl = modalSheetEl.querySelector('[data-p-toggle="transport"].selected');
    const transportMode = selectedTransportEl
      ? selectedTransportEl.getAttribute('data-value')
      : 'FLEXIBLE';

    SOAApiClient.updateUserPreferences({
      diet_mode: dietMode,
      transport_mode: transportMode,
      restriction_ids: restrictionIds,
      favorite_dish_category_ids: dishCatIds
    });

    if (appState.step === 'RESULTS') {
      appState.searchResults = runCurrentSearch();
    }
    renderUI();
    closeModal();
    return true;
  }

  // 0A. Open Dark Popover Menu ("Giá không đúng" & "Báo cáo hoặc đóng góp") on "⋯" click
  const openMoreMenuBtn = e.target.closest('[data-action="open-more-menu"]');
  if (openMoreMenuBtn) {
    e.stopPropagation();
    const restId = openMoreMenuBtn.getAttribute('data-id');
    toggleMoreMenuPopover(openMoreMenuBtn, restId);
    return true;
  }

  // 0. Open Detailed ERD Feedback & Price Report Modal
  const openErdFeedbackBtn = e.target.closest('[data-action="open-erd-feedback-modal"]');
  if (openErdFeedbackBtn) {
    const restId = openErdFeedbackBtn.getAttribute('data-id');
    openRestaurantFeedbackModal(restId);
    return true;
  }

  // 0B. "Sai giá" link inside Menu detail pane -> opens Wrong Price Report Modal
  const openWrongPriceBtn = e.target.closest('[data-action="open-wrong-price-modal"]');
  if (openWrongPriceBtn) {
    const restId = openWrongPriceBtn.getAttribute('data-id');
    openWrongPriceReportModal(restId);
    return true;
  }

  // 0C. "Thêm quán" button at end of restaurant list -> opens Add Restaurant Modal
  const openAddRestBtn = e.target.closest('[data-action="open-add-restaurant-modal"]');
  if (openAddRestBtn) {
    openAddRestaurantModal();
    return true;
  }

  // 1. Open Contribution modal for a specific restaurant
  const openContribBtn = e.target.closest('[data-action="open-contrib-for-restaurant"]');
  if (openContribBtn) {
    const restId = openContribBtn.getAttribute('data-id');
    openPersonalizationModal('contrib', restId, 'RESTAURANT_CORRECTION');
    return true;
  }

  return false;
}

/**
 * Shared handler for user form submissions (PRICE_REPORT, REVIEW, CONTRIBUTION)
 */
function handleErdFormSubmit(e) {
  const priceReportForm = e.target.closest('#formAddPriceReport');
  if (priceReportForm) {
    e.preventDefault();
    const restId = priceReportForm.getAttribute('data-restaurant-id');
    const fd = new FormData(priceReportForm);

    const result = SOAApiClient.submitPriceReport(restId, {
      menuItemId: fd.get('menuItemId'),
      observedPrice: fd.get('observedPrice'),
      evidenceUri: fd.get('evidenceUri'),
      comment: fd.get('comment')
    });
    if (!result.ok) {
      showNotice(result.error, 'error');
      return true;
    }
    const label = result.data.report_type === 'MISSING_PRICE' ? 'bổ sung giá' : 'báo cáo sai giá';
    showNotice(`Đã gửi ${label} (${result.data.report_type}) cho Admin xác minh.`, 'success');
    if (appState.step === 'RESULTS') {
      appState.searchResults = runCurrentSearch();
    }
    renderUI();
    closeModal();
    return true;
  }

  const reviewForm = e.target.closest('#formAddReview');
  if (reviewForm) {
    e.preventDefault();
    const restId = reviewForm.getAttribute('data-restaurant-id');
    const fd = new FormData(reviewForm);
    const result = SOAApiClient.submitReview(restId, {
      rating: fd.get('rating'),
      body: fd.get('comment')
    });
    if (!result.ok) {
      showNotice(result.error, 'error');
      return true;
    }
    showNotice('Đã gửi đánh giá.', 'success');
    if (appState.step === 'RESULTS') {
      appState.searchResults = runCurrentSearch();
    }
    renderUI();
    if (modalOverlayEl.classList.contains('open')) {
      openRestaurantFeedbackModal(restId);
    }
    return true;
  }

  const addNewRestForm = e.target.closest('#formAddNewRestaurant');
  if (addNewRestForm) {
    e.preventDefault();
    const fd = new FormData(addNewRestForm);
    const result = SOAApiClient.submitContribution({
      contributionType: 'NEW_RESTAURANT',
      restaurantId: null,
      evidenceUri: fd.get('evidenceUri') || null,
      payloadObj: {
        name: fd.get('proposedName') || '',
        address: fd.get('proposedAddress') || '',
        dishName: fd.get('dishName') || undefined,
        dishPrice: fd.get('dishPrice') !== '' && fd.get('dishPrice') !== null ? Number(fd.get('dishPrice')) : undefined,
        note: fd.get('note') || ''
      }
    });
    if (!result.ok) {
      showNotice(result.error, 'error');
      return true;
    }
    showNotice('Đã gửi thông tin quán mới cho Admin xác minh và hiển thị.', 'success');
    closeModal();
    return true;
  }

  const contribForm = e.target.closest('#formSubmitContribution');
  if (contribForm) {
    e.preventDefault();
    const fd = new FormData(contribForm);
    const result = SOAApiClient.submitContribution({
      contributionType: fd.get('contributionType'),
      restaurantId: fd.get('restaurantId') || null,
      evidenceUri: fd.get('evidenceUri') || null,
      payloadObj: {
        name: fd.get('proposedName') || undefined,
        address: fd.get('proposedAddress') || undefined,
        dishName: fd.get('dishName') || undefined,
        dishPrice: fd.get('dishPrice') !== '' && fd.get('dishPrice') !== null ? Number(fd.get('dishPrice')) : undefined,
        note: fd.get('note') || ''
      }
    });
    if (!result.ok) {
      showNotice(result.error, 'error');
      return true;
    }
    showNotice('Đã gửi đóng góp cho Admin xác minh & chỉnh sửa hiển thị.', 'success');
    closeModal();
    return true;
  }

  return false;
}

/**
 * Lightweight toast notice for API results (errors from auth guard / validation)
 */
let noticeTimer = null;
function showNotice(message, type = 'info') {
  let el = document.getElementById('appNoticeToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appNoticeToast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.className = `app-notice-toast ${type} show`;
  el.textContent = message;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

/**
 * Demo account switcher (session bar) inside modals
 */
function handleSessionSwitch(e) {
  const select = e.target.closest('[data-action="session-switch"]');
  if (!select) return false;
  const userId = select.value;
  const result = userId ? SOAApiClient.signInAs(userId) : SOAApiClient.signOut();
  if (!result.ok) {
    showNotice(result.error, 'error');
  }
  renderUI();
  const rerender = select.getAttribute('data-rerender');
  if (rerender === 'feedback') {
    openRestaurantFeedbackModal(select.getAttribute('data-restaurant-id'));
  } else if (rerender === 'price-report') {
    openWrongPriceReportModal(select.getAttribute('data-restaurant-id'));
  } else if (rerender === 'add-restaurant') {
    openAddRestaurantModal();
  } else {
    openPersonalizationModal(
      'contrib',
      appState.erdPreselectedRestaurantId,
      appState.erdPreselectedContribType
    );
  }
  return true;
}

/**
 * Event Delegation & Handlers
 */
function bindGlobalEvents() {
  btnCurrentLocationEl.addEventListener('click', requestDeviceLocation);

  btnSubmitSearchEl.addEventListener('click', () => {
    if (searchInputEl.value.trim()) {
      handleUserQuery(searchInputEl.value);
    } else if (appState.step === 'HOME') {
      handleUserQuery('phở bò');
    }
  });

  searchInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleUserQuery(searchInputEl.value);
    }
  });

  const resetToHome = () => {
    if (scanTimer) clearTimeout(scanTimer);
    closeExplorer();
    appState.step = 'HOME';
    appState.dish = null;
    appState.budget = null;
    appState.partySize = 1;
    appState.isScanning = false;
    appState.messages = [];
    appState.searchResults = null;
    renderUI();
  };

  btnNewSearchHeaderEl.addEventListener('click', resetToHome);
  document.getElementById('brandHomeBtn').addEventListener('click', resetToHome);

  document.getElementById('btnPersonalizeHeader').addEventListener('click', () => {
    openPersonalizationModal('prefs');
  });

  document.getElementById('chipLocationBtn').addEventListener('click', () => {
    appState.currentLocationIndex = (appState.currentLocationIndex + 1) % appState.locations.length;
    const loc = appState.locations[appState.currentLocationIndex];
    appState.currentLocationLabel = null;
    appState.currentCoordinates = { latitude: loc.lat, longitude: loc.lng };
    locationStatusEl.textContent = '';
    updateWeatherAtCoordinates(appState.currentCoordinates);
    emitServiceTrace('user-preference-service', 'PUT /api/v1/user/location', `Đổi vị trí: ${loc.fullAddress}`);
    if (appState.step === 'RESULTS') {
      appState.searchResults = runCurrentSearch();
    }
    renderUI();
  });

  chipBudgetBtnEl.addEventListener('click', () => {
    const budgets = [30000, 40000, 50000, 70000, 100000];
    const idx = budgets.indexOf(appState.budget || 50000);
    appState.budget = budgets[(idx + 1) % budgets.length];
    if (appState.step === 'RESULTS') {
      appState.searchResults = runCurrentSearch();
    }
    renderUI();
  });

  document.getElementById('chipRadiusBtn').addEventListener('click', () => {
    const radii = [1, 2, 5];
    const idx = radii.indexOf(appState.radiusKm);
    appState.radiusKm = radii[(idx + 1) % radii.length];
    if (appState.step === 'RESULTS') {
      appState.searchResults = runCurrentSearch();
    }
    renderUI();
  });

  // Delegated clicks inside Main Viewport
  viewportEl.addEventListener('click', (e) => {
    if (handleErdActionClick(e)) return;

    const foodArt = e.target.closest('[data-quick-dish]');
    if (foodArt) {
      handleUserQuery(foodArt.getAttribute('data-quick-dish'));
      return;
    }

    if (e.target.closest('#btnWeatherSuggestion')) {
      handleUserQuery(appState.weatherContext.suggestedQuery);
      return;
    }

    const budgetBtn = e.target.closest('[data-budget]');
    if (budgetBtn) {
      const amount = parseInt(budgetBtn.getAttribute('data-budget'), 10);
      handleUserQuery(formatK(amount));
      return;
    }

    const viewTab = e.target.closest('[data-view-mode]');
    if (viewTab) {
      appState.viewMode = viewTab.getAttribute('data-view-mode');
      renderUI();
      return;
    }

    const sortChip = e.target.closest('[data-sort]');
    if (sortChip) {
      appState.sortBy = sortChip.getAttribute('data-sort');
      appState.searchResults = runCurrentSearch();
      renderUI();
      return;
    }

    const favBtn = e.target.closest('[data-action="toggle-fav"]');
    if (favBtn) {
      toggleFavorite(favBtn.getAttribute('data-id'));
      renderUI();
      return;
    }

    // 7. Click "🍴 Menu" button -> Opens the 2-column "Quán quanh bạn" Menu Detail view on Desktop, or Clean Menu Sheet on Mobile
    const menuBtn = e.target.closest('[data-action="open-menu"]');
    if (menuBtn) {
      const id = menuBtn.getAttribute('data-id');
      if (desktopQuery.matches) {
        openExplorer(id);
      } else {
        openCleanMenuModal(id);
      }
      return;
    }

    const dirBtn = e.target.closest('[data-action="open-directions"]');
    if (dirBtn) {
      openDirections(dirBtn.getAttribute('data-id'));
      return;
    }

    const promoteCard = e.target.closest('[data-action="promote-hero"]');
    if (promoteCard && appState.searchResults) {
      const targetId = promoteCard.getAttribute('data-id');
      const all = [appState.searchResults.heroRestaurant, ...appState.searchResults.nearbyOthers];
      const chosen = all.find((r) => r.id === targetId);
      if (chosen) {
        appState.searchResults.heroRestaurant = chosen;
        appState.searchResults.nearbyOthers = all.filter((r) => r.id !== targetId);
        appState.viewMode = 'list';
        renderUI();
      }
      return;
    }

    if (e.target.closest('#btnOpenExplorer') || e.target.closest('#btnOpenExplorerMore')) {
      openExplorer(appState.searchResults?.heroRestaurant?.id || null);
    }
  });

  // Places Explorer interactions
  placesExplorerEl.addEventListener('click', (e) => {
    if (handleErdActionClick(e)) return;

    if (e.target.closest('[data-action="close-explorer"]')) {
      closeExplorer();
      return;
    }

    const sortChip = e.target.closest('[data-sort]');
    if (sortChip) {
      appState.sortBy = sortChip.getAttribute('data-sort');
      appState.searchResults = runCurrentSearch();
      renderUI();
      return;
    }

    const favBtn = e.target.closest('[data-action="toggle-fav"]');
    if (favBtn) {
      toggleFavorite(favBtn.getAttribute('data-id'));
      renderUI();
      return;
    }

    const menuBtn = e.target.closest('[data-action="explorer-menu"]');
    if (menuBtn) {
      const id = menuBtn.getAttribute('data-id');
      if (desktopQuery.matches) {
        appState.explorerMenuId = id;
        renderExplorer();
      } else {
        openCleanMenuModal(id);
      }
      return;
    }

    const dirBtn = e.target.closest('[data-action="open-directions"]');
    if (dirBtn) {
      openDirections(dirBtn.getAttribute('data-id'));
    }
  });

  // SOA Trace drawer (desktop)
  document.getElementById('btnToggleSoaPanel').addEventListener('click', () => {
    document.body.classList.toggle('soa-panel-open');
  });
  document.getElementById('btnCloseSoaPanel').addEventListener('click', () => {
    document.body.classList.remove('soa-panel-open');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.more-menu-popover') && !e.target.closest('[data-action="open-more-menu"]')) {
      closeMoreMenuPopover();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('moreActionsPopover')) {
      closeMoreMenuPopover();
      return;
    }
    if (modalOverlayEl.classList.contains('open')) closeModal();
    else if (appState.explorerOpen) closeExplorer();
    else document.body.classList.remove('soa-panel-open');
  });

  // Modal Close, ERD Action Clicks & Form Submits
  modalOverlayEl.addEventListener('click', (e) => {
    if (e.target === modalOverlayEl || e.target.closest('#btnCloseModal')) {
      closeModal();
      return;
    }
    if (e.target.closest('[data-action="open-directions"]')) {
      const id = e.target.closest('[data-action="open-directions"]').getAttribute('data-id');
      openDirections(id);
      return;
    }
    handleErdActionClick(e);
  });

  modalSheetEl.addEventListener('submit', (e) => {
    handleErdFormSubmit(e);
  });

  modalSheetEl.addEventListener('change', (e) => {
    handleSessionSwitch(e);
  });

  // Side Panel Scenario Quick Jump Buttons (Screens 1 to 8)
  document.querySelectorAll('[data-jump-screen]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const screenNum = parseInt(btn.getAttribute('data-jump-screen'), 10);
      jumpToScreenshotState(screenNum);
    });
  });
}

function findRestaurantById(restaurantId) {
  const all = appState.searchResults
    ? [appState.searchResults.heroRestaurant, ...appState.searchResults.nearbyOthers]
    : [];
  return all.find((r) => r && r.id === restaurantId) || appState.searchResults?.heroRestaurant;
}

/**
 * Open Clean Menu Modal (Matches the right-hand menu pane in the user's screenshot)
 */
function openCleanMenuModal(restaurantId) {
  const target = findRestaurantById(restaurantId);
  if (!target) return;

  modalSheetEl.classList.remove('is-personalize-sheet');
  modalSheetEl.innerHTML = renderCleanMenuModal(target, appState.budget);
  modalOverlayEl.classList.add('open');
}

let moreMenuAnchorEl = null;

function closeMoreMenuPopover() {
  const existing = document.getElementById('moreActionsPopover');
  if (existing) existing.remove();
  moreMenuAnchorEl = null;
}

function toggleMoreMenuPopover(anchorBtn, restaurantId) {
  const existing = document.getElementById('moreActionsPopover');
  if (existing && moreMenuAnchorEl === anchorBtn) {
    closeMoreMenuPopover();
    return;
  }
  closeMoreMenuPopover();

  const popover = document.createElement('div');
  popover.id = 'moreActionsPopover';
  popover.className = 'more-menu-popover';
  popover.setAttribute('role', 'menu');
  popover.innerHTML = renderMoreActionsPopover(restaurantId);
  document.body.appendChild(popover);
  moreMenuAnchorEl = anchorBtn;

  // Position anchored to the "⋯" button, keeping inside viewport bounds
  const rect = anchorBtn.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  const margin = 12;
  let left = rect.right - popRect.width;
  if (left < margin) left = margin;
  if (left + popRect.width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - popRect.width - margin);
  }
  let top = rect.bottom + 8;
  if (top + popRect.height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - popRect.height - 8);
  }
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;

  popover.addEventListener('click', (e) => {
    const wrongPriceBtn = e.target.closest('[data-action="more-menu-wrong-price"]');
    if (wrongPriceBtn) {
      const id = wrongPriceBtn.getAttribute('data-id');
      closeMoreMenuPopover();
      openWrongPriceReportModal(id);
      return;
    }
    const contribBtn = e.target.closest('[data-action="more-menu-contrib"]');
    if (contribBtn) {
      const id = contribBtn.getAttribute('data-id');
      closeMoreMenuPopover();
      openPersonalizationModal('contrib', id, 'RESTAURANT_CORRECTION');
    }
  });
}

/**
 * Open Reviews-Only Modal
 */
function openRestaurantFeedbackModal(restaurantId) {
  const target = findRestaurantById(restaurantId);
  if (!target) return;

  modalSheetEl.classList.remove('is-personalize-sheet');
  modalSheetEl.innerHTML = renderMenuAndFeedbackModal(target, SOAApiClient.getSession());
  modalOverlayEl.classList.add('open');
}

/**
 * Open Wrong Price Report Modal (opened from "Giá không đúng" in the "⋯" menu)
 */
function openWrongPriceReportModal(restaurantId) {
  const target = findRestaurantById(restaurantId);
  if (!target) return;

  modalSheetEl.classList.remove('is-personalize-sheet');
  modalSheetEl.innerHTML = renderWrongPriceReportModal(target, SOAApiClient.getSession());
  modalOverlayEl.classList.add('open');
}

/**
 * Open Add New Restaurant Modal (opened from "Thêm quán" at the end of the restaurant list)
 */
function openAddRestaurantModal() {
  modalSheetEl.classList.remove('is-personalize-sheet');
  modalSheetEl.innerHTML = renderAddRestaurantModal(SOAApiClient.getSession());
  modalOverlayEl.classList.add('open');
}

/**
 * Open Personalization or Contribution Modal
 */
function openPersonalizationModal(
  activeTab = 'prefs',
  preselectedRestaurantId = null,
  preselectedContribType = null
) {
  appState.erdPreselectedRestaurantId = preselectedRestaurantId;
  appState.erdPreselectedContribType = preselectedContribType;

  modalSheetEl.classList.toggle('is-personalize-sheet', activeTab === 'prefs');
  modalSheetEl.innerHTML = renderPersonalizationAndErdModal({
    activeTab,
    userPrefs: SOAApiClient.getUserPreferences(),
    dietaryCatalog: SOAApiClient.getDietaryCatalog(),
    dishCategoryCatalog: SOAApiClient.getDishCategoryCatalog(),
    allRestaurants: SOAApiClient.getAllRestaurantsList(),
    preselectedRestaurantId,
    preselectedContribType,
    session: SOAApiClient.getSession()
  });
  modalOverlayEl.classList.add('open');
}

function closeModal() {
  modalOverlayEl.classList.remove('open');
}

function getAllResultPlaces() {
  const results = appState.searchResults;
  return results ? [results.heroRestaurant, ...results.nearbyOthers].filter(Boolean) : [];
}

function toggleFavorite(id) {
  const updatedIds = SOAApiClient.toggleFavoriteRestaurant(id);
  appState.favorites = new Set(updatedIds);
}

function openDirections(id) {
  const place = getAllResultPlaces().find((r) => r.id === id) || appState.searchResults?.heroRestaurant;
  if (!place) return;
  const query =
    place.latitude && place.longitude
      ? `${place.latitude},${place.longitude}`
      : `${place.name} ${place.address}`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  window.open(mapsUrl, '_blank', 'noopener');
}

function renderExplorer() {
  const scrollList = placesExplorerEl.querySelector('.explorer-list');
  const scrollPane = placesExplorerEl.querySelector('.explorer-detail-pane');
  const listTop = scrollList ? scrollList.scrollTop : 0;
  const paneTop = scrollPane ? scrollPane.scrollTop : 0;

  placesExplorerEl.innerHTML = renderPlacesExplorer(appState, appState.explorerMenuId);

  const newList = placesExplorerEl.querySelector('.explorer-list');
  if (newList) newList.scrollTop = listTop;
  const newPane = placesExplorerEl.querySelector('.explorer-detail-pane');
  if (newPane && paneTop) newPane.scrollTop = paneTop;
}

function openExplorer(preselectMenuId = null) {
  if (!appState.searchResults) return;
  appState.explorerOpen = true;
  appState.explorerMenuId = preselectMenuId || appState.searchResults.heroRestaurant?.id || null;
  renderExplorer();
  placesExplorerEl.classList.add('open');
  placesExplorerEl.setAttribute('aria-hidden', 'false');
  emitServiceTrace(
    'restaurant-search-service',
    'GET /api/v1/restaurants/nearby',
    `Mở danh sách ${getAllResultPlaces().length} quán quanh bạn & xem Menu chi tiết`
  );
}

function closeExplorer() {
  appState.explorerOpen = false;
  placesExplorerEl.classList.remove('open');
  placesExplorerEl.setAttribute('aria-hidden', 'true');
}

function jumpToScreenshotState(screenNum) {
  if (scanTimer) clearTimeout(scanTimer);
  closeExplorer();

  if (screenNum === 1) {
    appState.step = 'HOME';
    appState.messages = [];
    appState.isScanning = false;
    searchInputEl.value = '';
    renderUI();
    return;
  }

  if (screenNum === 2) {
    appState.step = 'HOME';
    appState.messages = [];
    appState.isScanning = false;
    renderUI();
    searchInputEl.value = 'phở bò';
    searchInputEl.focus();
    return;
  }

  if (screenNum === 3) {
    appState.dish = 'Phở bò';
    appState.budget = null;
    appState.messages = [{ sender: 'user', text: 'phở bò' }];
    appState.step = 'SCANNING_FOR_SLOT';
    appState.isScanning = true;
    renderUI();
    return;
  }

  if (screenNum === 4) {
    appState.dish = 'Phở bò';
    appState.budget = null;
    appState.isScanning = false;
    appState.step = 'ASK_BUDGET';
    appState.messages = [
      { sender: 'user', text: 'phở bò' },
      { sender: 'bot', text: 'Phở bò nhé! Bạn muốn chi tối đa bao nhiêu tiền?' }
    ];
    renderUI();
    return;
  }

  if (screenNum === 5) {
    appState.dish = 'Phở bò';
    appState.budget = 50000;
    appState.isScanning = true;
    appState.step = 'RESULTS';
    appState.messages = [
      { sender: 'user', text: 'phở bò' },
      { sender: 'bot', text: 'Phở bò nhé! Bạn muốn chi tối đa bao nhiêu tiền?' },
      { sender: 'user', text: '50k' }
    ];
    renderUI();
    return;
  }

  // Screens 6, 7, 8: Final Results with "Pho Bo 158 - Quan Nhan"
  appState.dish = 'Phở bò';
  appState.budget = 50000;
  appState.radiusKm = 2;
  appState.isScanning = false;
  appState.viewMode = 'list';
  appState.sortBy = 'recommended';
  appState.step = 'RESULTS';
  appState.messages = [
    { sender: 'user', text: 'phở bò' },
    { sender: 'bot', text: 'Phở bò nhé! Bạn muốn chi tối đa bao nhiêu tiền?' },
    { sender: 'user', text: '50k' }
  ];
  appState.searchResults = runCurrentSearch();
  renderUI();
}

function renderServiceLogs(logs) {
  if (!serviceLogBoxEl) return;
  serviceLogBoxEl.innerHTML = logs
    .slice(0, 12)
    .map(
      (l) => `
      <div class="log-entry">
        <div>
          <span class="svc-name">[${l.serviceName}]</span>
          <span class="svc-time">${l.timeStr}</span>
        </div>
        <div style="color:#A7F3D0;">${l.endpoint}</div>
        <div>${l.payloadSummary}</div>
      </div>
    `
    )
    .join('');
}

  // Sync live updates when Admin moderates reports on admin.html in another tab
  window.addEventListener('storage', (e) => {
    if (e.key === DB_STORAGE_KEY) {
      if (appState.step === 'RESULTS') {
        appState.searchResults = runCurrentSearch();
      }
      renderUI();
    }
  });

  // Boot app
  initApp();
