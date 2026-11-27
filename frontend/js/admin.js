/**
 * Dedicated Admin Portal Controller (Login + User Reports & Contributions Moderation)
 * Separated completely from the public user frontend (index.html).
 * Strictly aligned with ERD schema:
 * - PRICE_REPORT: report_type (WRONG_PRICE | MISSING_PRICE), reviewed_by, review_note, reviewed_at
 * - PRICE_ASSERTION: is_current (supports updating price OR clearing to NO_PRICE)
 * - CONTRIBUTION: payload (jsonb), top-level evidence_uri, restaurant_id nullable for NEW_RESTAURANT
 * - RESTAURANT: visibility_status (PUBLISHED/CLOSED/SUSPENDED/REJECTED/PENDING) + verified_at/verified_by
 *   ("Đã xác minh" = verified_at IS NOT NULL; verification covers the restaurant including its prices)
 */

import { SOAApiClient, syncDatabaseFromStorage, DB_STORAGE_KEY } from './demo/apiClient.js';
import { formatK } from './demo/nlpParser.js';
import { bindAddressLookup, getSelectedLocation } from './components/addressLookup.js';

const rootEl = document.getElementById('adminAppRoot');

const adminState = {
  activeTab: 'price-reports', // 'price-reports' | 'contributions' | 'restaurants' | 'audit'
  priceFilter: 'PENDING', // 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'
  contribFilter: 'PENDING', // 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'
  loginError: ''
};

const CONTRIB_TYPE_LABELS = {
  NEW_RESTAURANT: 'Thêm quán mới',
  RESTAURANT_CORRECTION: 'Sai thông tin quán',
  MENU_CORRECTION: 'Menu của quán',
  CLOSED_REPORT: 'Báo quán đã đóng cửa'
};

const PRICE_REPORT_TYPE_LABELS = {
  WRONG_PRICE: 'Sai giá',
  MISSING_PRICE: 'Thiếu giá (No price)'
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateTime(iso) {
  if (!iso) return '';
  return String(iso).replace('T', ' ').slice(0, 16);
}

function getPayloadObj(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

let toastTimer = null;
function showToast(message, type = 'info') {
  let el = document.getElementById('adminToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'adminToast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.className = `admin-toast ${type} show`;
  el.textContent = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3600);
}

function renderLoginScreen() {
  return `
    <div class="admin-login-shell">
      <div class="admin-login-card">
        <div class="admin-login-brand">
          <div>
            <h1>Admin Portal</h1>
            <p>Mua Gì Đây · Trang kiểm duyệt độc lập</p>
          </div>
        </div>

        <p class="admin-login-desc">
          Đăng nhập bằng tài khoản Quản trị viên để xem và xác minh báo cáo sai/thiếu giá, sửa thông tin quán, menu hoặc báo đóng cửa từ người dùng.
        </p>

        ${adminState.loginError ? `<div class="admin-error-box">${escapeHtml(adminState.loginError)}</div>` : ''}

        <form id="adminLoginForm">
          <div class="admin-form-group">
            <label for="adminEmail">Email Quản trị viên</label>
            <input
              id="adminEmail"
              name="email"
              type="email"
              class="admin-input"
              placeholder="admin.moderator@muagiday.vn"
              autocomplete="username"
              required
            />
          </div>

          <div class="admin-form-group">
            <label for="adminPassword">Mật khẩu</label>
            <input
              id="adminPassword"
              name="password"
              type="password"
              class="admin-input"
              placeholder="Nhập mật khẩu Admin"
              autocomplete="current-password"
              required
            />
          </div>

          <button type="submit" class="btn-admin-primary" style="width:100%;margin-top:4px;">
            Đăng nhập trang Admin
          </button>
        </form>

        <div class="admin-demo-hint">
          <div><strong>Tài khoản Admin mẫu:</strong></div>
          <div>Email: <code>admin.moderator@muagiday.vn</code></div>
          <div>Mật khẩu: <code>admin123</code></div>
          <button type="button" class="btn-link-muted" id="btnFillDemoAdmin" style="margin-top:6px;">
            Điền nhanh thông tin Admin mẫu
          </button>
        </div>

        <div class="admin-login-footer">
          <a href="./index.html" class="btn-link-muted">Quay lại giao diện người dùng</a>
        </div>
      </div>
    </div>
  `;
}

function renderFilterPills(filterKey, currentValue, counts) {
  const options = [
    ['PENDING', `Chờ duyệt (${counts.PENDING || 0})`],
    ['APPROVED', `Đã duyệt (${counts.APPROVED || 0})`],
    ['REJECTED', `Từ chối (${counts.REJECTED || 0})`],
    ['ALL', `Tất cả (${counts.ALL || 0})`]
  ];
  return `
    <div class="admin-filter-pills">
      ${options
        .map(
          ([val, label]) => `
          <button type="button" class="admin-filter-pill ${currentValue === val ? 'active' : ''}" data-filter-key="${filterKey}" data-filter-val="${val}">
            ${label}
          </button>
        `
        )
        .join('')}
    </div>
  `;
}

function renderPriceReportsSection(allReports) {
  const counts = {
    ALL: allReports.length,
    PENDING: allReports.filter((r) => r.moderation_status === 'PENDING').length,
    APPROVED: allReports.filter((r) => r.moderation_status === 'APPROVED').length,
    REJECTED: allReports.filter((r) => r.moderation_status === 'REJECTED').length
  };
  const filtered =
    adminState.priceFilter === 'ALL'
      ? allReports
      : allReports.filter((r) => r.moderation_status === adminState.priceFilter);

  return `
    <div class="admin-filter-row">
      ${renderFilterPills('priceFilter', adminState.priceFilter, counts)}
      <span style="font-size:0.78rem;color:var(--text-secondary);">
        Gồm 2 loại: WRONG_PRICE (sai giá) và MISSING_PRICE (bổ sung giá cho món No price).
      </span>
    </div>

    <div class="admin-cards-list">
      ${
        filtered.length === 0
          ? `<div class="admin-empty-state">Không có báo cáo giá nào trong mục này.</div>`
          : filtered
              .map((pr) => {
                const reportedWrongText =
                  pr.reported_wrong_price !== null && pr.reported_wrong_price !== undefined
                    ? formatK(pr.reported_wrong_price)
                    : 'No price';
                const currentPriceText =
                  pr.current_price !== null && pr.current_price !== undefined
                    ? formatK(pr.current_price)
                    : 'No price';
                const suggestedText =
                  pr.observed_price !== null && pr.observed_price !== undefined
                    ? formatK(pr.observed_price)
                    : 'Không nhập';
                const statusClass = pr.moderation_status.toLowerCase();
                const typeLabel = PRICE_REPORT_TYPE_LABELS[pr.report_type] || pr.report_type;

                return `
                <article class="admin-item-card">
                  <div class="admin-item-head">
                    <div>
                      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
                        <span class="status-pill type-tag">${escapeHtml(typeLabel)}</span>
                        <span class="admin-item-title">${escapeHtml(pr.menu_item_name)}</span>
                      </div>
                      <div class="admin-item-meta">
                        ${escapeHtml(pr.restaurant_name)} · Người báo: <strong>${escapeHtml(pr.submitted_by_name)}</strong> · ${formatDateTime(pr.submitted_at)}
                      </div>
                    </div>
                    <span class="status-pill ${statusClass}">${escapeHtml(pr.moderation_status)}</span>
                  </div>

                  <div class="admin-info-grid">
                    <div>Giá bị báo sai: <strong style="color:#B91C1C;">${escapeHtml(reportedWrongText)}</strong></div>
                    <div>Giá đang hiển thị: <strong>${escapeHtml(currentPriceText)}</strong></div>
                    <div>Giá đề xuất: <strong style="color:var(--primary);">${escapeHtml(suggestedText)}</strong></div>
                    <div>
                      Minh chứng:
                      ${
                        pr.evidence_uri
                          ? `<a href="${escapeHtml(pr.evidence_uri)}" target="_blank" rel="noopener noreferrer">Xem ảnh / link minh chứng</a>`
                          : `<span style="color:var(--text-muted);">Không có</span>`
                      }
                    </div>
                  </div>

                  ${pr.comment ? `<p class="admin-quote">“${escapeHtml(pr.comment)}”</p>` : ''}

                  ${
                    pr.moderation_status === 'PENDING'
                      ? `
                        <form class="admin-action-box admin-verify-price-form" data-report-id="${pr.price_report_id}">
                          <div class="admin-action-box-title">Xác minh lại & cập nhật đúng giá hiển thị (hoặc gỡ về No price)</div>
                          <div class="admin-edit-grid">
                            <input
                              type="number"
                              name="verifiedPrice"
                              class="admin-input admin-input-sm"
                              value="${pr.observed_price ?? pr.reported_wrong_price ?? ''}"
                              placeholder="Nhập giá đúng (VNĐ)"
                              min="0"
                              step="1000"
                              required
                            />
                            <input
                              type="text"
                              name="reviewNote"
                              class="admin-input admin-input-sm"
                              placeholder="Ghi chú kiểm duyệt (review_note)..."
                            />
                          </div>
                          <div class="admin-action-row">
                            <button type="submit" class="btn-admin-verify">Xác minh & Cập nhật giá</button>
                            ${
                              pr.current_price !== null
                                ? `<button type="button" class="btn-admin-secondary" data-action="clear-report-price" data-report-id="${pr.price_report_id}">Gỡ giá về No price</button>`
                                : ''
                            }
                            <button type="button" class="btn-admin-danger" data-action="reject-price-report" data-report-id="${pr.price_report_id}">
                              Từ chối
                            </button>
                          </div>
                        </form>
                      `
                      : `<div style="font-size:0.81rem;color:${pr.moderation_status === 'REJECTED' ? '#B91C1C' : '#047857'};font-weight:700;">
                          ${pr.moderation_status === 'REJECTED' ? 'Đã từ chối' : 'Đã duyệt'}
                          ${pr.reviewed_by_name ? ` bởi ${escapeHtml(pr.reviewed_by_name)}` : ''}
                          ${pr.reviewed_at ? ` (${formatDateTime(pr.reviewed_at)})` : ''}
                          ${pr.review_note ? ` · ${escapeHtml(pr.review_note)}` : ''}
                        </div>`
                  }
                </article>
              `;
              })
              .join('')
      }
    </div>
  `;
}

function renderContributionsSection(contributions) {
  const counts = {
    ALL: contributions.length,
    PENDING: contributions.filter((c) => c.status === 'PENDING').length,
    APPROVED: contributions.filter((c) => c.status === 'APPROVED').length,
    REJECTED: contributions.filter((c) => c.status === 'REJECTED').length
  };
  const filtered =
    adminState.contribFilter === 'ALL'
      ? contributions
      : contributions.filter((c) => c.status === adminState.contribFilter);

  return `
    <div class="admin-filter-row">
      ${renderFilterPills('contribFilter', adminState.contribFilter, counts)}
      <span style="font-size:0.78rem;color:var(--text-secondary);">
        Admin kiểm tra, chỉnh sửa lại thông tin chính xác rồi duyệt để cập nhật lên bảng gốc.
      </span>
    </div>

    <div class="admin-cards-list">
      ${
        filtered.length === 0
          ? `<div class="admin-empty-state">Không có đóng góp / báo cáo nào trong mục này.</div>`
          : filtered
              .map((c) => {
                const payload = getPayloadObj(c.payload);
                const typeLabel = CONTRIB_TYPE_LABELS[c.contribution_type] || c.contribution_type;
                const proposedName = payload.name || '';
                const proposedAddress = payload.address || '';
                const firstDish = payload.dishName || '';
                const firstDishPrice = payload.dishPrice ?? '';
                const statusClass = c.status.toLowerCase();
                const showRestaurantFields =
                  c.contribution_type === 'NEW_RESTAURANT' || c.contribution_type === 'RESTAURANT_CORRECTION';
                const showMenuFields =
                  c.contribution_type === 'NEW_RESTAURANT' || c.contribution_type === 'MENU_CORRECTION';

                return `
                <article class="admin-item-card">
                  <div class="admin-item-head">
                    <div>
                      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
                        <span class="status-pill type-tag">${escapeHtml(typeLabel)}</span>
                        <span class="admin-item-title">${escapeHtml(proposedName || c.restaurant_name || 'Đóng góp cộng đồng')}</span>
                      </div>
                      <div class="admin-item-meta">
                        Người gửi: <strong>${escapeHtml(c.submitted_by_name)}</strong> · ${formatDateTime(c.submitted_at)}
                      </div>
                    </div>
                    <span class="status-pill ${statusClass}">${escapeHtml(c.status)}</span>
                  </div>

                  <div class="admin-info-grid">
                    <div>Quán liên quan: <strong>${escapeHtml(c.restaurant_id ? c.restaurant_name : 'Quán mới (restaurant_id = NULL)')}</strong></div>
                    <div>Địa chỉ đề xuất: <strong>${escapeHtml(proposedAddress || 'Theo quán gốc')}</strong></div>
                    ${firstDish ? `<div>Món đề xuất: <strong>${escapeHtml(firstDish)}</strong> (${firstDishPrice !== '' ? formatK(firstDishPrice) : 'No price'})</div>` : ''}
                    <div>
                      Minh chứng:
                      ${
                        c.evidence_uri
                          ? `<a href="${escapeHtml(c.evidence_uri)}" target="_blank" rel="noopener noreferrer">Xem minh chứng</a>`
                          : `<span style="color:var(--text-muted);">Không có</span>`
                      }
                    </div>
                  </div>

                  ${payload.note ? `<p class="admin-quote">“${escapeHtml(payload.note)}”</p>` : ''}

                  ${
                    c.status === 'PENDING'
                      ? `
                        <form class="admin-action-box admin-approve-contrib-form" data-contrib-id="${c.contribution_id}">
                          <div class="admin-action-box-title">
                            ${
                              c.contribution_type === 'CLOSED_REPORT'
                                ? 'Xác nhận quán đã đóng cửa (chuyển visibility_status sang CLOSED)'
                                : 'Xác minh & chỉnh sửa thông tin chính xác trước khi hiển thị'
                            }
                          </div>
                          ${
                            showRestaurantFields
                              ? `
                                <div class="admin-edit-grid">
                                  <input type="text" name="editName" class="admin-input admin-input-sm" value="${escapeHtml(proposedName || c.restaurant_name || '')}" placeholder="Tên quán chuẩn" />
                                  <div>
                                    <input type="text" name="editAddress" class="admin-input admin-input-sm" data-goong-address autocomplete="off" aria-label="Địa chỉ chuẩn" maxlength="200" value="${escapeHtml(proposedAddress)}" placeholder="Địa chỉ chuẩn" />
                                    <div class="geo-address-options" data-goong-options aria-live="polite"></div>
                                  </div>
                                </div>
                                <details>
                                  <summary>Nhập tọa độ nếu dùng địa chỉ thủ công</summary>
                                  <div class="admin-edit-grid">
                                    <input type="number" name="editLatitude" class="admin-input admin-input-sm" aria-label="Vĩ độ" placeholder="Vĩ độ (latitude)" min="-90" max="90" step="any" />
                                    <input type="number" name="editLongitude" class="admin-input admin-input-sm" aria-label="Kinh độ" placeholder="Kinh độ (longitude)" min="-180" max="180" step="any" />
                                  </div>
                                </details>
                              `
                              : ''
                          }
                          ${
                            showMenuFields
                              ? `
                                <div class="admin-edit-grid">
                                  <input type="text" name="editDishName" class="admin-input admin-input-sm" value="${escapeHtml(firstDish)}" placeholder="Tên món chuẩn" />
                                  <input type="number" name="editDishPrice" class="admin-input admin-input-sm" value="${escapeHtml(firstDishPrice)}" placeholder="Giá chuẩn (bỏ trống = No price)" min="0" step="1000" />
                                </div>
                              `
                              : ''
                          }
                          <input type="text" name="reviewNote" class="admin-input admin-input-sm" value="Admin đã xác minh chính xác & cập nhật hiển thị" placeholder="Ghi chú kiểm duyệt..." />
                          <div class="admin-action-row">
                            <button type="submit" class="btn-admin-verify">Xác minh & Lưu hiển thị</button>
                            <button type="button" class="btn-admin-danger" data-action="reject-contrib" data-contrib-id="${c.contribution_id}">
                              Từ chối
                            </button>
                          </div>
                        </form>
                      `
                      : `<div style="font-size:0.81rem;color:${c.status === 'REJECTED' ? '#B91C1C' : '#047857'};font-weight:700;">
                          ${c.status === 'REJECTED' ? 'Đã từ chối' : 'Đã xác minh & áp dụng'} bởi ${escapeHtml(c.reviewed_by_name || 'Admin')} · ${escapeHtml(c.review_note || '')}
                        </div>`
                  }
                </article>
              `;
              })
              .join('')
      }
    </div>
  `;
}

function renderRestaurantsSection(restaurants) {
  return `
    <div class="admin-cards-list">
      ${restaurants
        .map((r) => {
          const vis = r.visibility_status || 'PUBLISHED';
          const isPublished = vis === 'PUBLISHED';
          return `
            <article class="admin-item-card">
              <div class="admin-item-head">
                <div>
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
                    <span class="admin-item-title">${escapeHtml(r.name)}</span>
                    <span class="status-pill ${r.isVerified ? 'verified' : 'unverified'}">
                      ${r.isVerified ? 'Đã xác minh' : 'Chưa xác minh'}
                    </span>
                    ${!isPublished ? `<span class="status-pill suspended">${escapeHtml(vis)}</span>` : ''}
                  </div>
                  <div class="admin-item-meta">
                    ${escapeHtml(r.address)} · SĐT: ${escapeHtml(r.phone || 'Chưa có')} · Mở tới ${escapeHtml(r.openUntil)}
                    ${r.verifiedAt ? ` · Xác minh lúc ${formatDateTime(r.verifiedAt)}` : ''}
                  </div>
                </div>
                <div>
                  <button
                    type="button"
                    class="${r.isVerified ? 'btn-admin-secondary' : 'btn-admin-verify'}"
                    data-action="toggle-rest-verified"
                    data-id="${r.id}"
                    data-next-verified="${r.isVerified ? 'false' : 'true'}"
                  >
                    ${r.isVerified ? 'Đổi sang Chưa xác minh' : 'Đánh dấu Đã xác minh'}
                  </button>
                </div>
              </div>

              <div class="admin-menu-chips">
                ${r.menu
                  .map((m) => {
                    const hasPrice = m.minPrice !== null && m.minPrice !== undefined;
                    return `<span class="admin-menu-chip">
                      ${escapeHtml(m.name)}:
                      <strong class="${hasPrice ? '' : 'no-price'}">${hasPrice ? formatK(m.minPrice) : 'No price'}</strong>
                      ${hasPrice ? `<button type="button" class="btn-link-muted" style="margin-left:5px;font-size:0.7rem;" data-action="clear-menu-price" data-item-id="${m.menu_item_id}" title="Chuyển is_current = false để về No price">Gỡ giá</button>` : ''}
                    </span>`;
                  })
                  .join('')}
              </div>
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderAuditSection(auditEvents) {
  return `
    <div class="admin-cards-list">
      ${
        auditEvents.length === 0
          ? `<div class="admin-empty-state">Chưa có nhật ký kiểm duyệt nào.</div>`
          : auditEvents
              .map(
                (ev) => `
              <article class="admin-item-card" style="padding:14px 18px;">
                <div class="admin-item-head" style="margin-bottom:6px;">
                  <div>
                    <div class="admin-item-title" style="font-size:0.9rem;">${escapeHtml(ev.action)}</div>
                    <div class="admin-item-meta">
                      Entity: <code>${escapeHtml(ev.entity_type)}(${escapeHtml(String(ev.entity_id).slice(-8))})</code> · Bởi: <strong>${escapeHtml(ev.actor_name)}</strong>
                    </div>
                  </div>
                  <span style="font-size:0.76rem;color:var(--text-muted);">${formatDateTime(ev.occurred_at)}</span>
                </div>
                <div style="font-size:0.75rem;font-family:monospace;background:#FAF6F1;padding:8px 10px;border-radius:9px;word-break:break-all;">
                  <div>Before: ${escapeHtml(JSON.stringify(ev.before_data))}</div>
                  <div style="color:#047857;margin-top:3px;">After: ${escapeHtml(JSON.stringify(ev.after_data))}</div>
                </div>
              </article>
            `
              )
              .join('')
      }
    </div>
  `;
}

function renderSearchAreasSection(areas) {
  const nextOrder = Math.min(10000, Math.max(0, ...areas.map((area) => area.display_order)) + 1);
  return `
    <div class="admin-cards-list">
      ${[null, ...areas].map((area) => `
        <article class="admin-item-card">
          <div class="admin-item-title">${area ? escapeHtml(area.name) : 'Thêm khu vực'}</div>
          <form class="admin-action-box" data-search-area-form data-area-id="${escapeHtml(area?.area_id)}">
            <div class="admin-edit-grid">
              <label>Tên khu vực
                <input class="admin-input admin-input-sm" name="areaName" required maxlength="100" value="${escapeHtml(area?.name)}" />
              </label>
              <label>Tên trên nút chọn
                <input class="admin-input admin-input-sm" name="shortLabel" required maxlength="40" value="${escapeHtml(area?.short_label)}" />
              </label>
              <div>
                <label for="anchor-${area?.area_id ?? 'new'}">Địa chỉ điểm mốc</label>
                <input class="admin-input admin-input-sm" id="anchor-${area?.area_id ?? 'new'}" name="anchorAddress" data-goong-address autocomplete="off" required maxlength="500" value="${escapeHtml(area?.anchor_address)}" />
                <div class="geo-address-options" data-goong-options aria-live="polite"></div>
              </div>
              <label>Thứ tự hiển thị
                <input class="admin-input admin-input-sm" name="displayOrder" type="number" min="0" max="10000" step="1" required value="${area?.display_order ?? nextOrder}" />
              </label>
            </div>
            ${area ? `<p class="admin-item-meta">Tọa độ hiện tại: ${area.anchor_latitude}, ${area.anchor_longitude}</p>` : ''}
            <details>
              <summary>Nhập tọa độ thủ công</summary>
              <div class="admin-edit-grid">
                <input class="admin-input admin-input-sm" type="number" name="anchorLatitude" aria-label="Vĩ độ" placeholder="Vĩ độ" min="-90" max="90" step="any" />
                <input class="admin-input admin-input-sm" type="number" name="anchorLongitude" aria-label="Kinh độ" placeholder="Kinh độ" min="-180" max="180" step="any" />
              </div>
            </details>
            <div class="admin-action-row">
              <label><input type="checkbox" name="isActive" ${area?.is_active !== false ? 'checked' : ''} /> Hiện trong danh sách tìm kiếm</label>
              <button type="submit" class="btn-admin-verify">Lưu khu vực</button>
            </div>
          </form>
        </article>
      `).join('')}
    </div>
  `;
}

function renderDashboard() {
  const allPriceReports = SOAApiClient.getAllPriceReports();
  const contributions = SOAApiClient.getContributions();
  const restaurants = SOAApiClient.getAllRestaurantsForAdmin();
  const auditEvents = SOAApiClient.getAuditEvents();
  const searchAreas = SOAApiClient.getSearchAreasForAdmin();

  const pendingPriceCount = allPriceReports.filter((r) => r.moderation_status === 'PENDING').length;
  const pendingContribCount = contributions.filter((c) => c.status === 'PENDING').length;
  const publishedRestaurants = restaurants.filter((r) => r.visibility_status === 'PUBLISHED');
  const verifiedCount = publishedRestaurants.filter((r) => r.isVerified).length;

  return `
    <header class="admin-header">
      <div class="admin-header-inner">
        <div class="admin-header-left">
          <div>
            <div class="admin-header-title">Mua Gì Đây · Trang Quản Trị Admin</div>
            <div class="admin-header-sub">Tách biệt hoàn toàn khỏi giao diện người dùng · Đồng bộ dữ liệu trực tiếp</div>
          </div>
        </div>

        <div class="admin-header-actions">
          <a href="./index.html" class="btn-admin-secondary">Trang người dùng</a>
          <button type="button" class="btn-admin-secondary" id="btnResetDemoData" title="Khôi phục dữ liệu mẫu ban đầu">Reset mẫu</button>
          <button type="button" class="btn-admin-danger" id="btnAdminLogout">Đăng xuất</button>
        </div>
      </div>
    </header>

    <main class="admin-container">
      <section class="admin-stats-grid">
        <div class="admin-stat-card">
          <div class="admin-stat-label">Báo cáo giá chờ xử lý</div>
          <div class="admin-stat-value accent">${pendingPriceCount}</div>
          <div class="admin-stat-hint">Tổng ${allPriceReports.length} báo cáo (WRONG/MISSING)</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-label">Đóng góp quán/menu chờ duyệt</div>
          <div class="admin-stat-value accent">${pendingContribCount}</div>
          <div class="admin-stat-hint">Tổng ${contributions.length} đóng góp cộng đồng</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-label">Quán đã xác minh</div>
          <div class="admin-stat-value green">${verifiedCount} / ${publishedRestaurants.length}</div>
          <div class="admin-stat-hint">Chỉ có 2 trạng thái: Đã / Chưa xác minh</div>
        </div>
        <div class="admin-stat-card">
          <div class="admin-stat-label">Nhật ký kiểm duyệt</div>
          <div class="admin-stat-value">${auditEvents.length}</div>
          <div class="admin-stat-hint">Append-only AUDIT_EVENT</div>
        </div>
      </section>

      <nav class="admin-tabs-bar">
        <button type="button" class="admin-tab-btn ${adminState.activeTab === 'price-reports' ? 'active' : ''}" data-tab="price-reports">
          Báo cáo sai / thiếu giá
          <span class="tab-count-badge ${pendingPriceCount === 0 ? 'muted' : ''}">${pendingPriceCount}</span>
        </button>
        <button type="button" class="admin-tab-btn ${adminState.activeTab === 'contributions' ? 'active' : ''}" data-tab="contributions">
          Đóng góp & Báo cáo quán
          <span class="tab-count-badge ${pendingContribCount === 0 ? 'muted' : ''}">${pendingContribCount}</span>
        </button>
        <button type="button" class="admin-tab-btn ${adminState.activeTab === 'restaurants' ? 'active' : ''}" data-tab="restaurants">
          Quản lý quán ăn (${restaurants.length})
        </button>
        <button type="button" class="admin-tab-btn ${adminState.activeTab === 'search-areas' ? 'active' : ''}" data-tab="search-areas">
          Khu vực tìm kiếm (${searchAreas.length})
        </button>
        <button type="button" class="admin-tab-btn ${adminState.activeTab === 'audit' ? 'active' : ''}" data-tab="audit">
          Nhật ký kiểm duyệt (${auditEvents.length})
        </button>
      </nav>

      ${
        adminState.activeTab === 'price-reports'
          ? renderPriceReportsSection(allPriceReports)
          : adminState.activeTab === 'contributions'
            ? renderContributionsSection(contributions)
            : adminState.activeTab === 'restaurants'
              ? renderRestaurantsSection(restaurants)
              : adminState.activeTab === 'search-areas'
                ? renderSearchAreasSection(searchAreas)
                : renderAuditSection(auditEvents)
      }
    </main>
  `;
}

function renderApp() {
  syncDatabaseFromStorage();
  const session = SOAApiClient.getAdminSession();
  if (!session.isAuthenticated) {
    rootEl.innerHTML = renderLoginScreen();
    return;
  }
  rootEl.innerHTML = renderDashboard();
}

// Delegated Events
rootEl.addEventListener('click', (e) => {
  if (e.target.closest('#btnFillDemoAdmin')) {
    const emailEl = document.getElementById('adminEmail');
    const passEl = document.getElementById('adminPassword');
    if (emailEl) emailEl.value = 'admin.moderator@muagiday.vn';
    if (passEl) passEl.value = 'admin123';
    return;
  }

  if (e.target.closest('#btnAdminLogout')) {
    SOAApiClient.adminLogout();
    adminState.loginError = '';
    renderApp();
    showToast('Đã đăng xuất khỏi trang Admin.', 'info');
    return;
  }

  if (e.target.closest('#btnResetDemoData')) {
    SOAApiClient.resetDemoDatabase();
    renderApp();
    showToast('Đã khôi phục dữ liệu mẫu ban đầu.', 'success');
    return;
  }

  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) {
    adminState.activeTab = tabBtn.getAttribute('data-tab');
    renderApp();
    return;
  }

  const filterPill = e.target.closest('[data-filter-key]');
  if (filterPill) {
    const key = filterPill.getAttribute('data-filter-key');
    adminState[key] = filterPill.getAttribute('data-filter-val');
    renderApp();
    return;
  }

  const clearReportPriceBtn = e.target.closest('[data-action="clear-report-price"]');
  if (clearReportPriceBtn) {
    const reportId = clearReportPriceBtn.getAttribute('data-report-id');
    const form = clearReportPriceBtn.closest('form');
    const reviewNote = form ? new FormData(form).get('reviewNote') : '';
    const res = SOAApiClient.adminVerifyPriceReport(reportId, null, {
      reviewNote,
      clearToNoPrice: true
    });
    if (!res.ok) return showToast(res.error, 'error');
    showToast('Đã gỡ giá sai về No price (lịch sử giá vẫn được bảo toàn).', 'success');
    renderApp();
    return;
  }

  const rejectPriceBtn = e.target.closest('[data-action="reject-price-report"]');
  if (rejectPriceBtn) {
    const reportId = rejectPriceBtn.getAttribute('data-report-id');
    const form = rejectPriceBtn.closest('form');
    const reviewNote = form ? new FormData(form).get('reviewNote') : '';
    const res = SOAApiClient.adminRejectPriceReport(reportId, reviewNote || 'Bằng chứng chưa đủ tin cậy');
    if (!res.ok) return showToast(res.error, 'error');
    showToast('Đã từ chối báo cáo giá.', 'success');
    renderApp();
    return;
  }

  const rejectContribBtn = e.target.closest('[data-action="reject-contrib"]');
  if (rejectContribBtn) {
    const contribId = rejectContribBtn.getAttribute('data-contrib-id');
    const form = rejectContribBtn.closest('form');
    const reviewNote = form ? new FormData(form).get('reviewNote') : '';
    const res = SOAApiClient.reviewContribution(contribId, {
      decision: 'REJECTED',
      reviewNote: reviewNote || 'Thông tin chưa đủ cơ sở xác thực'
    });
    if (!res.ok) return showToast(res.error, 'error');
    showToast('Đã từ chối đóng góp.', 'success');
    renderApp();
    return;
  }

  const toggleVerifiedBtn = e.target.closest('[data-action="toggle-rest-verified"]');
  if (toggleVerifiedBtn) {
    const restId = toggleVerifiedBtn.getAttribute('data-id');
    const nextVerified = toggleVerifiedBtn.getAttribute('data-next-verified') === 'true';
    const res = SOAApiClient.adminSetRestaurantVerified(restId, nextVerified);
    if (!res.ok) return showToast(res.error, 'error');
    showToast(
      nextVerified ? 'Đã chuyển quán sang trạng thái Đã xác minh.' : 'Đã chuyển quán sang Chưa xác minh.',
      'success'
    );
    renderApp();
    return;
  }

  const clearMenuPriceBtn = e.target.closest('[data-action="clear-menu-price"]');
  if (clearMenuPriceBtn) {
    const itemId = clearMenuPriceBtn.getAttribute('data-item-id');
    const res = SOAApiClient.adminClearMenuItemPrice(itemId);
    if (!res.ok) return showToast(res.error, 'error');
    showToast('Đã gỡ giá món về No price.', 'success');
    renderApp();
  }
});

rootEl.addEventListener('submit', (e) => {
  const loginForm = e.target.closest('#adminLoginForm');
  if (loginForm) {
    e.preventDefault();
    const fd = new FormData(loginForm);
    const res = SOAApiClient.adminLogin({
      email: fd.get('email'),
      password: fd.get('password')
    });
    if (!res.ok) {
      adminState.loginError = res.error;
      renderApp();
      return;
    }
    adminState.loginError = '';
    showToast(`Chào mừng ${res.data.display_name}!`, 'success');
    renderApp();
    return;
  }

  const searchAreaForm = e.target.closest('[data-search-area-form]');
  if (searchAreaForm) {
    e.preventDefault();
    const fd = new FormData(searchAreaForm);
    const res = SOAApiClient.saveSearchArea({
      areaId: searchAreaForm.dataset.areaId || null,
      name: fd.get('areaName'),
      shortLabel: fd.get('shortLabel'),
      address: fd.get('anchorAddress'),
      displayOrder: fd.get('displayOrder'),
      active: fd.has('isActive'),
      latitude: fd.get('anchorLatitude'),
      longitude: fd.get('anchorLongitude'),
      location: getSelectedLocation(searchAreaForm)
    });
    if (!res.ok) return showToast(res.error, 'error');
    renderApp();
    showToast('Đã lưu khu vực tìm kiếm.', 'success');
    return;
  }

  const verifyPriceForm = e.target.closest('.admin-verify-price-form');
  if (verifyPriceForm) {
    e.preventDefault();
    const reportId = verifyPriceForm.getAttribute('data-report-id');
    const fd = new FormData(verifyPriceForm);
    const res = SOAApiClient.adminVerifyPriceReport(reportId, fd.get('verifiedPrice'), {
      reviewNote: fd.get('reviewNote')
    });
    if (!res.ok) return showToast(res.error, 'error');
    showToast('Đã xác minh & cập nhật đúng giá tiền hiển thị.', 'success');
    renderApp();
    return;
  }

  const approveContribForm = e.target.closest('.admin-approve-contrib-form');
  if (approveContribForm) {
    e.preventDefault();
    const contribId = approveContribForm.getAttribute('data-contrib-id');
    const fd = new FormData(approveContribForm);
    const editedData = {};
    if (fd.has('editName')) editedData.name = fd.get('editName');
    if (fd.has('editAddress')) editedData.address = fd.get('editAddress');
    const location = getSelectedLocation(approveContribForm);
    if (location) editedData.location = location;
    if (fd.get('editLatitude')) editedData.latitude = fd.get('editLatitude');
    if (fd.get('editLongitude')) editedData.longitude = fd.get('editLongitude');
    if (fd.has('editDishName')) editedData.dishName = fd.get('editDishName');
    if (fd.has('editDishPrice')) editedData.dishPrice = fd.get('editDishPrice');

    const res = SOAApiClient.reviewContribution(contribId, {
      decision: 'APPROVED',
      reviewNote: fd.get('reviewNote') || 'Admin đã xác minh & cập nhật hiển thị',
      editedData
    });
    if (!res.ok) return showToast(res.error, 'error');
    showToast('Đã xác minh, chỉnh sửa và áp dụng hiển thị.', 'success');
    renderApp();
  }
});

// Live sync if user submits new report on index.html in another tab
window.addEventListener('storage', (e) => {
  if (e.key === DB_STORAGE_KEY) {
    renderApp();
  }
});

bindAddressLookup(rootEl);
renderApp();
