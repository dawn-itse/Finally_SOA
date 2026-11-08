/**
 * Main Application State & Event Controller ("Mua Gì Đây")
 */

import { SOAApiClient, onServiceLog, emitServiceTrace } from './services/apiClient.js';
import { parseUserUtterance, formatK } from './services/nlpParser.js';
import {
  renderHomeHero,
  renderConversationStream,
  renderMenuAndFeedbackModal
} from './components/renderers.js';

const appState = {
  step: 'HOME', // 'HOME' | 'ASK_BUDGET' | 'RESULTS'
  weatherIndex: 0,
  weatherContext: null,
  locations: SOAApiClient.getLocations(),
  currentLocationIndex: 0,
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
  showAllNearby: false
};

// DOM Elements
const viewportEl = document.getElementById('appMainViewport');
const searchInputEl = document.getElementById('dockSearchInput');
const btnSubmitSearchEl = document.getElementById('btnSubmitSearch');
const btnNewSearchHeaderEl = document.getElementById('btnNewSearchHeader');
const chipLocationLabelEl = document.getElementById('chipLocationLabel');
const dockFullAddressEl = document.getElementById('dockFullAddress');
const chipBudgetBtnEl = document.getElementById('chipBudgetBtn');
const chipBudgetLabelEl = document.getElementById('chipBudgetLabel');
const chipRadiusLabelEl = document.getElementById('chipRadiusLabel');
const modalOverlayEl = document.getElementById('appModalOverlay');
const modalSheetEl = document.getElementById('appModalSheet');
const serviceLogBoxEl = document.getElementById('serviceLogBox');

let scanTimer = null;

/**
 * Initialize Application
 */
function initApp() {
  // Subscribe SOA Service Log Viewer
  onServiceLog(renderServiceLogs);

  // Load initial weather greeting (Context & Weather Service)
  appState.weatherContext = SOAApiClient.getWeatherGreeting(appState.weatherIndex);

  renderUI();
  bindGlobalEvents();
  startPlaceholderTypewriter();
}

/**
 * Render main viewport & sync bottom dock chips
 */
function renderUI() {
  const loc = appState.locations[appState.currentLocationIndex];
  chipLocationLabelEl.textContent = loc.shortLabel;
  dockFullAddressEl.textContent = `Tìm quanh ${loc.fullAddress}`;
  chipRadiusLabelEl.textContent = `${appState.radiusKm}km`;

  // Show "+ Tìm mới" button in header when not on HOME screen
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

  // Parse utterance via NLP Service
  const parsed = parseUserUtterance(text, appState);
  emitServiceTrace('nlp-conversation-service', 'POST /api/v1/nlp/parse', parsed.explanation || `Input: "${text}"`);

  // Add user message bubble
  appState.messages.push({ sender: 'user', text });

  // Case 1: Multi-turn refinements ("rẻ hơn", "gần hơn", "đi 2 người")
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

  // Update extracted slots
  if (parsed.extractedDish) {
    appState.dish = parsed.extractedDish;
  }
  if (parsed.extractedBudget) {
    appState.budget = parsed.extractedBudget;
  }

  // Case 2: Has Dish, but missing Budget -> Scan Radar briefly (Screen 3) then ask budget (Screen 4)
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

  // Case 3: Both Dish and Budget are known -> Show Radar (Screen 5) then Results (Screens 6-8)
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
    appState.searchResults = SOAApiClient.searchRestaurants({
      dish: appState.dish,
      budget: appState.budget,
      radiusKm: appState.radiusKm,
      sortBy: appState.sortBy,
      partySize: appState.partySize
    });
    renderUI();
    scrollToBottom();
  }, delayMs);
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    viewportEl.scrollTop = viewportEl.scrollHeight;
  });
}

/**
 * Dynamic Typewriter Placeholder (Matches Screenshots 1, 3, 4, 5, 6, 7, 8)
 */
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

/**
 * Event Delegation & Handlers
 */
function bindGlobalEvents() {
  // Search submit button & Enter key
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

  // Reset to Home ("+ Tìm mới" or Brand Logo click)
  const resetToHome = () => {
    if (scanTimer) clearTimeout(scanTimer);
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

  // Personalization Header Button (Cycles Weather or opens Personalization Modal)
  document.getElementById('btnPersonalizeHeader').addEventListener('click', () => {
    openPersonalizationModal();
  });

  // Bottom Dock Filter Chips (Location, Budget, Radius)
  document.getElementById('chipLocationBtn').addEventListener('click', () => {
    appState.currentLocationIndex = (appState.currentLocationIndex + 1) % appState.locations.length;
    const loc = appState.locations[appState.currentLocationIndex];
    emitServiceTrace('user-preference-service', 'PUT /api/v1/user/location', `Đổi vị trí: ${loc.fullAddress}`);
    if (appState.step === 'RESULTS') {
      appState.searchResults = SOAApiClient.searchRestaurants(appState);
    }
    renderUI();
  });

  chipBudgetBtnEl.addEventListener('click', () => {
    const budgets = [30000, 40000, 50000, 70000, 100000];
    const idx = budgets.indexOf(appState.budget || 50000);
    appState.budget = budgets[(idx + 1) % budgets.length];
    if (appState.step === 'RESULTS') {
      appState.searchResults = SOAApiClient.searchRestaurants(appState);
    }
    renderUI();
  });

  document.getElementById('chipRadiusBtn').addEventListener('click', () => {
    const radii = [1, 2, 5];
    const idx = radii.indexOf(appState.radiusKm);
    appState.radiusKm = radii[(idx + 1) % radii.length];
    if (appState.step === 'RESULTS') {
      appState.searchResults = SOAApiClient.searchRestaurants(appState);
    }
    renderUI();
  });

  // Delegated clicks inside Main Viewport
  viewportEl.addEventListener('click', (e) => {
    // 1. Click floating food illustration on Home screen
    const foodArt = e.target.closest('[data-quick-dish]');
    if (foodArt) {
      handleUserQuery(foodArt.getAttribute('data-quick-dish'));
      return;
    }

    // 2. Click weather suggestion quote
    if (e.target.closest('#btnWeatherSuggestion')) {
      handleUserQuery(appState.weatherContext.suggestedQuery);
      return;
    }

    // 3. Click Quick Budget Option Chip (30k, 50k, 100k, 200k)
    const budgetBtn = e.target.closest('[data-budget]');
    if (budgetBtn) {
      const amount = parseInt(budgetBtn.getAttribute('data-budget'), 10);
      handleUserQuery(formatK(amount));
      return;
    }

    // 4. Switch View Mode Tab (Danh sách | Bản đồ)
    const viewTab = e.target.closest('[data-view-mode]');
    if (viewTab) {
      appState.viewMode = viewTab.getAttribute('data-view-mode');
      renderUI();
      return;
    }

    // 5. Click Sort Chip (Đề xuất, Gần -> xa, Đánh giá, Giá)
    const sortChip = e.target.closest('[data-sort]');
    if (sortChip) {
      appState.sortBy = sortChip.getAttribute('data-sort');
      appState.searchResults = SOAApiClient.searchRestaurants(appState);
      renderUI();
      return;
    }

    // 6. Toggle Favorite Heart
    const favBtn = e.target.closest('[data-action="toggle-fav"]');
    if (favBtn) {
      const id = favBtn.getAttribute('data-id');
      if (appState.favorites.has(id)) {
        appState.favorites.delete(id);
      } else {
        appState.favorites.add(id);
      }
      emitServiceTrace('user-preference-service', 'POST /api/v1/user/favorites', `Restaurant ID: ${id}`);
      renderUI();
      return;
    }

    // 7. Open Menu & Feedback Modal
    const menuBtn = e.target.closest('[data-action="open-menu"]');
    if (menuBtn) {
      const id = menuBtn.getAttribute('data-id');
      openRestaurantModal(id);
      return;
    }

    // 8. Open Directions
    const dirBtn = e.target.closest('[data-action="open-directions"]');
    if (dirBtn) {
      const hero = appState.searchResults?.heroRestaurant;
      if (hero) {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hero.name + ' ' + hero.address)}`;
        window.open(mapsUrl, '_blank', 'noopener');
      }
      return;
    }

    // 9. Promote a nearby card or map pin to Hero Card
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

    // 10. Expand More Nearby Places
    if (e.target.closest('#btnExpandMorePlaces') || e.target.closest('#btnToggleAllNearby')) {
      appState.showAllNearby = !appState.showAllNearby;
      renderUI();
    }
  });

  // Modal Close & Form Submit
  modalOverlayEl.addEventListener('click', (e) => {
    if (e.target === modalOverlayEl || e.target.closest('#btnCloseModal')) {
      closeModal();
    }
  });

  modalSheetEl.addEventListener('submit', (e) => {
    const form = e.target.closest('#formAddFeedback');
    if (form) {
      e.preventDefault();
      const restId = form.getAttribute('data-restaurant-id');
      const formData = new FormData(form);
      const updated = SOAApiClient.addFeedback(restId, {
        author: formData.get('author'),
        rating: formData.get('rating'),
        verifiedPrice: formData.get('verifiedPrice'),
        comment: formData.get('comment')
      });
      if (updated) {
        appState.searchResults = SOAApiClient.searchRestaurants(appState);
        openRestaurantModal(restId);
        renderUI();
      }
    }
  });

  // Side Panel Scenario Quick Jump Buttons (Screens 1 to 8)
  document.querySelectorAll('[data-jump-screen]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const screenNum = parseInt(btn.getAttribute('data-jump-screen'), 10);
      jumpToScreenshotState(screenNum);
    });
  });
}

/**
 * Open Restaurant Menu & Feedback Modal
 */
function openRestaurantModal(restaurantId) {
  const all = appState.searchResults
    ? [appState.searchResults.heroRestaurant, ...appState.searchResults.nearbyOthers]
    : [];
  const target = all.find((r) => r && r.id === restaurantId) || appState.searchResults?.heroRestaurant;
  if (!target) return;

  modalSheetEl.innerHTML = renderMenuAndFeedbackModal(target, appState.budget);
  modalOverlayEl.classList.add('open');
}

/**
 * Open Personalization Modal ("Cá nhân hóa")
 */
function openPersonalizationModal() {
  modalSheetEl.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-header">
      <div class="modal-title">⚙️ Cá nhân hóa khẩu vị & Ngữ cảnh</div>
      <button class="btn-close-modal" id="btnCloseModal">✕</button>
    </div>
    <p style="font-size:0.84rem;color:var(--text-secondary);margin-bottom:12px;">
      Thay đổi thời tiết giả lập hoặc mức chi tiêu mặc định để kiểm tra dịch vụ <strong>Context & Weather Service</strong>:
    </p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
      <button class="btn-scenario" id="btnWeather0">☀️ 28° · Trời quang (Gợi ý Bún riêu cua & Trà đào)</button>
      <button class="btn-scenario" id="btnWeather1">🍃 22° · Se lạnh (Gợi ý Phở bò tái nóng hổi)</button>
      <button class="btn-scenario" id="btnWeather2">🌧️ 24° · Mưa nhẹ (Gợi ý Bánh mì pate & Cà phê sữa)</button>
    </div>
  `;
  modalOverlayEl.classList.add('open');

  ['btnWeather0', 'btnWeather1', 'btnWeather2'].forEach((id, idx) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => {
        appState.weatherIndex = idx;
        appState.weatherContext = SOAApiClient.getWeatherGreeting(idx);
        appState.step = 'HOME';
        closeModal();
        renderUI();
      });
    }
  });
}

function closeModal() {
  modalOverlayEl.classList.remove('open');
}

/**
 * Jump directly to any of the 8 Screenshot States for easy demonstration
 */
function jumpToScreenshotState(screenNum) {
  if (scanTimer) clearTimeout(scanTimer);

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
  appState.searchResults = SOAApiClient.searchRestaurants({
    dish: 'Phở bò',
    budget: 50000,
    radiusKm: 2,
    sortBy: 'recommended',
    partySize: 1
  });
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

initApp();
