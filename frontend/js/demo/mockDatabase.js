/**
 * Normalized 18-table ERD mock for "Mua Gì Đây".
 * 1. APP_USER  2. CUISINE  3. RESTAURANT  4. RESTAURANT_LOCATION  5. RESTAURANT_CUISINE
 * 6. MENU_ITEM  7. PRICE_ASSERTION  8. PRICE_REPORT  9. REVIEW
 * 10. USER_PREFERENCE  11. DIETARY_RESTRICTION  12. USER_RESTRICTION
 * 13. DISH_CATEGORY  14. USER_FAVORITE_DISH  15. FAVORITE_RESTAURANT
 * 16. CONTRIBUTION  17. AUDIT_EVENT  18. SEARCH_AREA
 */

const SEARCH_AREA = [
  {
    area_id: '18000000-0000-4000-8000-000000000001',
    name: 'Lê Văn Lương, Hà Nội',
    short_label: 'Lê Văn Lương',
    anchor_address: '68 Lê Văn Lương, Hà Nội',
    anchor_latitude: 21.0048,
    anchor_longitude: 105.8042,
    anchor_place_id: null,
    display_order: 1,
    is_active: true
  },
  {
    area_id: '18000000-0000-4000-8000-000000000002',
    name: 'Đại học Bách Khoa, Hà Nội',
    short_label: 'ĐH Bách Khoa',
    anchor_address: '1 Đại Cồ Việt, Hà Nội',
    anchor_latitude: 21.0051,
    anchor_longitude: 105.8432,
    anchor_place_id: null,
    display_order: 2,
    is_active: true
  },
  {
    area_id: '18000000-0000-4000-8000-000000000003',
    name: 'Duy Tân, Hà Nội',
    short_label: 'Duy Tân',
    anchor_address: '78 Duy Tân, Hà Nội',
    anchor_latitude: 21.0312,
    anchor_longitude: 105.7829,
    anchor_place_id: null,
    display_order: 3,
    is_active: true
  }
];

export const WEATHER_CONTEXTS = [
  {
    id: 'morning-clear',
    temp: 28,
    condition: 'trời quang',
    greetingQuestion: 'Sáng nay bạn muốn chi bao nhiêu tiền?',
    suggestionQuote: 'Trời quang ấm nhẹ lúc sáng sớm, bún riêu cua với trà đào cho dễ ăn mà thanh miệng nhé.',
    suggestedQuery: '45k bún riêu cua'
  },
  {
    id: 'morning-cool',
    temp: 22,
    condition: 'se lạnh',
    greetingQuestion: 'Sáng nay bạn muốn chi bao nhiêu tiền?',
    suggestionQuote: 'Sáng sớm trời se lạnh dễ chịu, làm một bát phở bò tái nóng hổi kèm quẩy giòn là chuẩn bài!',
    suggestedQuery: '50k phở bò'
  },
  {
    id: 'morning-rainy',
    temp: 24,
    condition: 'mưa nhẹ',
    greetingQuestion: 'Sáng nay bạn muốn chi bao nhiêu tiền?',
    suggestionQuote: 'Ngoài trời đang mưa nhẹ, ổ bánh mì pate trứng nóng giòn với ly cà phê sữa ấm áp sẽ rất hợp.',
    suggestedQuery: '35k bánh mì pate'
  }
];

/**
 * Preview ERD tables
 */
export const ERD_DATABASE = {
  RESTAURANT_DISCOVERY: [],
  SEARCH_AREA,
  // 1. APP_USER
  APP_USER: [
    {
      user_id: '00000000-0000-4000-8000-000000000001',
      email: 'admin.moderator@muagiday.vn',
      password_hash: '$2b$10$erdAdminHashSimulated',
      display_name: 'Admin Kiểm Duyệt',
      account_status: 'ACTIVE',
      role: 'ADMIN',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-04-01T00:00:00Z'
    },
    {
      user_id: '00000000-0000-4000-8000-000000000002',
      email: 'minh.quan@muagiday.vn',
      password_hash: '$2b$10$erdUserHashSimulated',
      display_name: 'Minh Quân',
      account_status: 'ACTIVE',
      role: 'USER',
      created_at: '2024-01-10T07:30:00Z',
      updated_at: '2024-04-12T08:00:00Z'
    },
    {
      user_id: '00000000-0000-4000-8000-000000000003',
      email: 'minh.hoang@example.com',
      password_hash: '$2b$10$hash3',
      display_name: 'Minh Hoàng',
      account_status: 'ACTIVE',
      role: 'USER',
      created_at: '2024-01-05T06:00:00Z',
      updated_at: '2024-01-15T06:00:00Z'
    },
    {
      user_id: '00000000-0000-4000-8000-000000000004',
      email: 'tuan.anh@example.com',
      password_hash: '$2b$10$hash4',
      display_name: 'Tuấn Anh',
      account_status: 'ACTIVE',
      role: 'USER',
      created_at: '2024-02-10T06:00:00Z',
      updated_at: '2024-03-05T06:00:00Z'
    },
    {
      user_id: '00000000-0000-4000-8000-000000000005',
      email: 'hong.nhung@example.com',
      password_hash: '$2b$10$hash5',
      display_name: 'Hồng Nhung',
      account_status: 'ACTIVE',
      role: 'USER',
      created_at: '2024-02-01T06:00:00Z',
      updated_at: '2024-02-18T06:00:00Z'
    },
    {
      user_id: '00000000-0000-4000-8000-000000000006',
      email: 'thu.ha@example.com',
      password_hash: '$2b$10$hash6',
      display_name: 'Thu Hà',
      account_status: 'ACTIVE',
      role: 'USER',
      created_at: '2024-03-11T06:00:00Z',
      updated_at: '2024-04-02T06:00:00Z'
    },
    {
      user_id: '00000000-0000-4000-8000-000000000007',
      email: 'duc.phuc@example.com',
      password_hash: '$2b$10$hash7',
      display_name: 'Đức Phúc',
      account_status: 'ACTIVE',
      role: 'USER',
      created_at: '2024-03-20T06:00:00Z',
      updated_at: '2024-04-08T06:00:00Z'
    },
    {
      user_id: '00000000-0000-4000-8000-000000000008',
      email: 'quoc.khanh@example.com',
      password_hash: '$2b$10$hash8',
      display_name: 'Quốc Khánh',
      account_status: 'ACTIVE',
      role: 'USER',
      created_at: '2024-02-02T06:00:00Z',
      updated_at: '2024-02-22T06:00:00Z'
    }
  ],

  // 2. CUISINE
  CUISINE: [
    { cuisine_id: '10000000-0000-4000-8000-000000000001', name: 'Quán phở' },
    { cuisine_id: '10000000-0000-4000-8000-000000000002', name: 'Cơm rang & Phở' },
    { cuisine_id: '10000000-0000-4000-8000-000000000003', name: 'Quán bún riêu' },
    { cuisine_id: '10000000-0000-4000-8000-000000000004', name: 'Bánh mì & Cà phê' },
    { cuisine_id: '10000000-0000-4000-8000-000000000005', name: 'Đồ uống sáng' }
  ],

  // 3. RESTAURANT
  // visibility_status: PENDING, PUBLISHED, REJECTED, SUSPENDED, CLOSED (Only PUBLISHED appears in public search)
  // Verification label = verified_at IS NOT NULL (Đã xác minh) | verified_at IS NULL (Chưa xác minh).
  // No is_verified column. verified_at / verified_by are set or cleared together (both NULL or both NOT NULL).
  // Verification covers the whole restaurant including its prices (no per-price verification).
  // Every Admin approval that changes the restaurant, its menu or its price refreshes verified_at / verified_by.
  RESTAURANT: [
    {
      restaurant_id: '20000000-0000-4000-8000-000000000001',
      slug: 'pho-bo-158-quan-nhan',
      name: 'Pho Bo 158 - Quan Nhan',
      description: 'Phở bò truyền thống nước dùng ninh xương 12 tiếng, thái thịt dày, chỗ để xe rộng.',
      phone: '0904158156',
      visibility_status: 'PUBLISHED',
      verified_at: '2024-01-16T09:00:00Z',
      verified_by: '00000000-0000-4000-8000-000000000001',
      source_type: 'OSM',
      source_ref: 'node/881234001',
      open_until: '21:00',
      dish_keywords: ['phở bò', 'pho bo', 'phở', 'pho', 'ăn sáng'],
      map_pos: { x: 68, y: 34 },
      created_at: '2024-01-01T06:00:00Z',
      updated_at: '2024-04-10T06:00:00Z'
    },
    {
      restaurant_id: '20000000-0000-4000-8000-000000000002',
      slug: 'manh-dat-pho-bo-com-rang',
      name: 'Mạnh Đạt - Phở Bò, Cơm Rang',
      description: 'Quán phở bò và cơm rang dưa bò phục vụ nhanh giờ cao điểm buổi sáng.',
      phone: '0912820082',
      visibility_status: 'PUBLISHED',
      verified_at: null,
      verified_by: null,
      source_type: 'OSM',
      source_ref: 'node/881234002',
      open_until: '22:00',
      comparison_badge: 'Gần hơn 340m',
      dish_keywords: ['phở bò', 'pho bo', 'phở', 'cơm rang', 'cơm', 'ăn sáng'],
      map_pos: { x: 48, y: 52 },
      created_at: '2024-01-05T06:00:00Z',
      updated_at: '2024-03-20T06:00:00Z'
    },
    {
      restaurant_id: '20000000-0000-4000-8000-000000000003',
      slug: 'pho-bo-gia-truyen-hoang-ngan',
      name: 'Phở Bò Nam Định - Hoàng Ngân',
      description: 'Phở bò gia truyền Nam Định đập tỏi thơm lừng, giá bình dân.',
      phone: '0988112112',
      visibility_status: 'PUBLISHED',
      verified_at: '2024-02-11T08:00:00Z',
      verified_by: '00000000-0000-4000-8000-000000000001',
      source_type: 'COMMUNITY',
      source_ref: 'contrib/70001',
      open_until: '14:00',
      comparison_badge: 'Gần hơn 550m',
      dish_keywords: ['phở bò', 'pho bo', 'phở', 'ăn sáng'],
      map_pos: { x: 35, y: 28 },
      created_at: '2024-01-12T06:00:00Z',
      updated_at: '2024-03-18T06:00:00Z'
    },
    {
      restaurant_id: '20000000-0000-4000-8000-000000000004',
      slug: 'bun-rieu-cua-co-huong',
      name: 'Bún Riêu Cua Cô Hương - Nhân Chính',
      description: 'Bún riêu cua đồng giã tay, đậu rán giòn, kèm trà đào cam sả thanh mát.',
      phone: '0977241160',
      visibility_status: 'PUBLISHED',
      verified_at: '2024-04-02T08:30:00Z',
      verified_by: '00000000-0000-4000-8000-000000000001',
      source_type: 'OSM',
      source_ref: 'node/881234004',
      open_until: '13:30',
      comparison_badge: 'Rất gần bạn',
      dish_keywords: ['bún riêu', 'bun rieu', 'bún riêu cua', 'bún', 'trà đào', 'ăn sáng'],
      map_pos: { x: 56, y: 65 },
      created_at: '2024-01-20T06:00:00Z',
      updated_at: '2024-04-05T06:00:00Z'
    },
    {
      restaurant_id: '20000000-0000-4000-8000-000000000005',
      slug: 'banh-mi-pate-chao-le-van-luong',
      name: 'Bánh Mì Pate & Cà Phê Phố Cũ',
      description: 'Bánh mì pate gan tự làm nướng giòn, cà phê sữa đá pha phin đậm vị.',
      phone: '0936420042',
      visibility_status: 'PUBLISHED',
      verified_at: '2024-04-05T07:05:00Z',
      verified_by: '00000000-0000-4000-8000-000000000001',
      source_type: 'PARTNER',
      source_ref: 'partner/bm-42',
      open_until: '20:00',
      comparison_badge: 'Gần hơn 950m',
      dish_keywords: ['bánh mì', 'banh mi', 'bánh mì pate', 'cà phê', 'ca phe', 'cà phê sữa', 'ăn sáng'],
      map_pos: { x: 42, y: 74 },
      created_at: '2024-01-25T06:00:00Z',
      updated_at: '2024-04-11T06:00:00Z'
    },
    {
      restaurant_id: '20000000-0000-4000-8000-000000000006',
      slug: 'pho-thin-lo-duc-chi-nhanh',
      name: 'Phở Bò Tái Lăn - Ngụy Như Kon Tum',
      description: 'Phở bò tái lăn xào tỏi gừng dậy mùi, nhiều hành lá.',
      phone: '0963950095',
      visibility_status: 'PUBLISHED',
      verified_at: null,
      verified_by: null,
      source_type: 'OSM',
      source_ref: 'way/229100112',
      open_until: '21:30',
      comparison_badge: 'Gần hơn 200m',
      dish_keywords: ['phở bò', 'pho bo', 'phở', 'ăn sáng'],
      map_pos: { x: 75, y: 62 },
      created_at: '2024-02-01T06:00:00Z',
      updated_at: '2024-03-28T06:00:00Z'
    }
  ],

  // 4. RESTAURANT_LOCATION (1-N, tọa độ mẫu với tham chiếu OSM cũ)
  RESTAURANT_LOCATION: [
    {
      location_id: '21000000-0000-4000-8000-000000000001',
      restaurant_id: '20000000-0000-4000-8000-000000000001',
      address_text: '156 P. Quan Nhân, Nhân Chính, Thanh Xuân',
      latitude: 21.0086,
      longitude: 105.8095,
      provider: 'OSM',
      provider_place_id: 'node/881234001',
      commune: null,
      province: null,
      deprecated_address_text: null,
      geocoded_at: null,
      is_primary: true
    },
    {
      location_id: '21000000-0000-4000-8000-000000000011',
      restaurant_id: '20000000-0000-4000-8000-000000000001',
      address_text: 'Chi nhánh 2: 18 Hoàng Đạo Thúy, Trung Hòa, Cầu Giấy',
      latitude: 21.0065,
      longitude: 105.8021,
      provider: 'OSM',
      provider_place_id: 'node/881234099',
      commune: null,
      province: null,
      deprecated_address_text: null,
      geocoded_at: null,
      is_primary: false
    },
    {
      location_id: '21000000-0000-4000-8000-000000000002',
      restaurant_id: '20000000-0000-4000-8000-000000000002',
      address_text: '82 Vũ Trọng Phụng, Thanh Xuân Trung, Thanh Xuân',
      latitude: 20.9994,
      longitude: 105.8081,
      provider: 'OSM',
      provider_place_id: 'node/881234002',
      commune: null,
      province: null,
      deprecated_address_text: null,
      geocoded_at: null,
      is_primary: true
    },
    {
      location_id: '21000000-0000-4000-8000-000000000003',
      restaurant_id: '20000000-0000-4000-8000-000000000003',
      address_text: '112 Hoàng Ngân, Trung Hòa, Cầu Giấy',
      latitude: 21.0092,
      longitude: 105.8018,
      provider: 'OSM',
      provider_place_id: 'node/881234003',
      commune: null,
      province: null,
      deprecated_address_text: null,
      geocoded_at: null,
      is_primary: true
    },
    {
      location_id: '21000000-0000-4000-8000-000000000004',
      restaurant_id: '20000000-0000-4000-8000-000000000004',
      address_text: '24 Ngõ 116 Nhân Hòa, Nhân Chính, Thanh Xuân',
      latitude: 21.0021,
      longitude: 105.8075,
      provider: 'OSM',
      provider_place_id: 'node/881234004',
      commune: null,
      province: null,
      deprecated_address_text: null,
      geocoded_at: null,
      is_primary: true
    },
    {
      location_id: '21000000-0000-4000-8000-000000000005',
      restaurant_id: '20000000-0000-4000-8000-000000000005',
      address_text: '42 Lê Văn Lương, Nhân Chính, Thanh Xuân',
      latitude: 21.0055,
      longitude: 105.8051,
      provider: 'OSM',
      provider_place_id: 'node/881234005',
      commune: null,
      province: null,
      deprecated_address_text: null,
      geocoded_at: null,
      is_primary: true
    },
    {
      location_id: '21000000-0000-4000-8000-000000000006',
      restaurant_id: '20000000-0000-4000-8000-000000000006',
      address_text: '95 Ngụy Như Kon Tum, Nhân Chính, Thanh Xuân',
      latitude: 21.0008,
      longitude: 105.8029,
      provider: 'OSM',
      provider_place_id: 'way/229100112',
      commune: null,
      province: null,
      deprecated_address_text: null,
      geocoded_at: null,
      is_primary: true
    }
  ],

  // 5. RESTAURANT_CUISINE (M-N join table)
  RESTAURANT_CUISINE: [
    { restaurant_id: '20000000-0000-4000-8000-000000000001', cuisine_id: '10000000-0000-4000-8000-000000000001' },
    { restaurant_id: '20000000-0000-4000-8000-000000000002', cuisine_id: '10000000-0000-4000-8000-000000000001' },
    { restaurant_id: '20000000-0000-4000-8000-000000000002', cuisine_id: '10000000-0000-4000-8000-000000000002' },
    { restaurant_id: '20000000-0000-4000-8000-000000000003', cuisine_id: '10000000-0000-4000-8000-000000000001' },
    { restaurant_id: '20000000-0000-4000-8000-000000000004', cuisine_id: '10000000-0000-4000-8000-000000000003' },
    { restaurant_id: '20000000-0000-4000-8000-000000000004', cuisine_id: '10000000-0000-4000-8000-000000000005' },
    { restaurant_id: '20000000-0000-4000-8000-000000000005', cuisine_id: '10000000-0000-4000-8000-000000000004' },
    { restaurant_id: '20000000-0000-4000-8000-000000000006', cuisine_id: '10000000-0000-4000-8000-000000000001' }
  ],

  // 6. MENU_ITEM (Identity only; price history lives in PRICE_ASSERTION)
  MENU_ITEM: [
    // Pho Bo 158 - Quan Nhan
    {
      menu_item_id: '30000000-0000-4000-8000-000000000001',
      restaurant_id: '20000000-0000-4000-8000-000000000001',
      name: 'Phở bò chín',
      description: 'Bát phở bò chín nạm truyền thống',
      status: 'ACTIVE',
      diet_tags: ['HIGH_PROTEIN'],
      created_at: '2024-01-01T06:00:00Z',
      updated_at: '2024-04-01T06:00:00Z'
    },
    {
      menu_item_id: '30000000-0000-4000-8000-000000000002',
      restaurant_id: '20000000-0000-4000-8000-000000000001',
      name: 'Phở bò tái',
      description: 'Thịt bò tươi thái mỏng chần nước dùng sôi',
      status: 'ACTIVE',
      diet_tags: ['HIGH_PROTEIN'],
      created_at: '2024-01-01T06:00:00Z',
      updated_at: '2024-04-01T06:00:00Z'
    },
    {
      menu_item_id: '30000000-0000-4000-8000-000000000003',
      restaurant_id: '20000000-0000-4000-8000-000000000001',
      name: 'Phở tái nạm gầu',
      description: 'Đầy đủ tái, nạm, gầu giòn',
      status: 'ACTIVE',
      diet_tags: ['HIGH_PROTEIN'],
      created_at: '2024-01-01T06:00:00Z',
      updated_at: '2024-04-01T06:00:00Z'
    },
    {
      menu_item_id: '30000000-0000-4000-8000-000000000004',
      restaurant_id: '20000000-0000-4000-8000-000000000001',
      name: 'Phở bò đặc biệt',
      description: 'Bát lớn kèm lõi rùa và trứng chần',
      status: 'ACTIVE',
      diet_tags: ['HIGH_PROTEIN'],
      created_at: '2024-01-01T06:00:00Z',
      updated_at: '2024-04-01T06:00:00Z'
    },
    {
      menu_item_id: '30000000-0000-4000-8000-000000000005',
      restaurant_id: '20000000-0000-4000-8000-000000000001',
      name: 'Quẩy giòn (đĩa)',
      description: 'Quẩy nóng ăn kèm phở',
      status: 'ACTIVE',
      diet_tags: [],
      created_at: '2024-01-01T06:00:00Z',
      updated_at: '2024-04-01T06:00:00Z'
    },
    // Menu item without any PRICE_ASSERTION -> API returns status: NO_PRICE per ERD rule
    {
      menu_item_id: '30000000-0000-4000-8000-000000000006',
      restaurant_id: '20000000-0000-4000-8000-000000000001',
      name: 'Trứng gà ta chần',
      description: 'Món gọi thêm (chưa có dữ liệu giá)',
      status: 'ACTIVE',
      diet_tags: ['HIGH_PROTEIN', 'LOW_CARB'],
      created_at: '2024-03-01T06:00:00Z',
      updated_at: '2024-04-01T06:00:00Z'
    },

    // Mạnh Đạt - Phở Bò, Cơm Rang
    {
      menu_item_id: '30000000-0000-4000-8000-000000000021',
      restaurant_id: '20000000-0000-4000-8000-000000000002',
      name: 'Phở bò tái chín',
      description: 'Phở bò nước trong vị thanh',
      status: 'ACTIVE',
      diet_tags: ['HIGH_PROTEIN'],
      created_at: '2024-01-05T06:00:00Z',
      updated_at: '2024-03-20T06:00:00Z'
    },
    {
      menu_item_id: '30000000-0000-4000-8000-000000000022',
      restaurant_id: '20000000-0000-4000-8000-000000000002',
      name: 'Cơm rang dưa bò',
      description: 'Cơm rang hạt săn giòn kèm dưa chua xào bò',
      status: 'ACTIVE',
      diet_tags: [],
      created_at: '2024-01-05T06:00:00Z',
      updated_at: '2024-03-20T06:00:00Z'
    },
    {
      menu_item_id: '30000000-0000-4000-8000-000000000023',
      restaurant_id: '20000000-0000-4000-8000-000000000002',
      name: 'Phở bò bắp trần',
      description: 'Bắp bò hoa thái mỏng',
      status: 'ACTIVE',
      diet_tags: ['HIGH_PROTEIN'],
      created_at: '2024-01-05T06:00:00Z',
      updated_at: '2024-03-20T06:00:00Z'
    },

    // Phở Bò Nam Định - Hoàng Ngân
    {
      menu_item_id: '30000000-0000-4000-8000-000000000031',
      restaurant_id: '20000000-0000-4000-8000-000000000003',
      name: 'Phở bò chín',
      description: 'Phở bò Nam Định chuẩn vị',
      status: 'ACTIVE',
      diet_tags: ['HIGH_PROTEIN'],
      created_at: '2024-01-12T06:00:00Z',
      updated_at: '2024-03-18T06:00:00Z'
    },
    {
      menu_item_id: '30000000-0000-4000-8000-000000000032',
      restaurant_id: '20000000-0000-4000-8000-000000000003',
      name: 'Phở bò tái đập tỏi',
      description: 'Thịt bò tái đập dập ướp gừng tỏi',
      status: 'ACTIVE',
      diet_tags: ['HIGH_PROTEIN'],
      created_at: '2024-01-12T06:00:00Z',
      updated_at: '2024-03-18T06:00:00Z'
    },
    {
      menu_item_id: '30000000-0000-4000-8000-000000000033',
      restaurant_id: '20000000-0000-4000-8000-000000000003',
      name: 'Phở tái gầu',
      description: 'Tái mềm kết hợp gầu bò béo giòn',
      status: 'ACTIVE',
      diet_tags: ['HIGH_PROTEIN'],
      created_at: '2024-01-12T06:00:00Z',
      updated_at: '2024-03-18T06:00:00Z'
    },

    // Bún Riêu Cua Cô Hương
    {
      menu_item_id: '30000000-0000-4000-8000-000000000041',
      restaurant_id: '20000000-0000-4000-8000-000000000004',
      name: 'Bún riêu cua đậu',
      description: 'Riêu cua đồng xịn kèm đậu phụ rán giòn',
      status: 'ACTIVE',
      diet_tags: [],
      created_at: '2024-01-20T06:00:00Z',
      updated_at: '2024-04-05T06:00:00Z'
    },
    {
      menu_item_id: '30000000-0000-4000-8000-000000000042',
      restaurant_id: '20000000-0000-4000-8000-000000000004',
      name: 'Bún riêu bò giò',
      description: 'Bún riêu cua thêm thịt bò trần và giò tai',
      status: 'ACTIVE',
      diet_tags: ['HIGH_PROTEIN'],
      created_at: '2024-01-20T06:00:00Z',
      updated_at: '2024-04-05T06:00:00Z'
    },
    {
      menu_item_id: '30000000-0000-4000-8000-000000000043',
      restaurant_id: '20000000-0000-4000-8000-000000000004',
      name: 'Trà đào cam sả',
      description: 'Trà đào thanh mát uống kèm bún riêu',
      status: 'ACTIVE',
      diet_tags: ['VEGETARIAN'],
      created_at: '2024-01-20T06:00:00Z',
      updated_at: '2024-04-05T06:00:00Z'
    },

    // Bánh Mì Pate & Cà Phê Phố Cũ
    {
      menu_item_id: '30000000-0000-4000-8000-000000000051',
      restaurant_id: '20000000-0000-4000-8000-000000000005',
      name: 'Bánh mì pate trứng',
      description: 'Pate gan tự làm béo ngậy kèm trứng ốp',
      status: 'ACTIVE',
      diet_tags: [],
      created_at: '2024-01-25T06:00:00Z',
      updated_at: '2024-04-11T06:00:00Z'
    },
    {
      menu_item_id: '30000000-0000-4000-8000-000000000052',
      restaurant_id: '20000000-0000-4000-8000-000000000005',
      name: 'Bánh mì pate xá xíu',
      description: 'Pate gan + thịt xá xíu đậm đà',
      status: 'ACTIVE',
      diet_tags: ['HIGH_PROTEIN'],
      created_at: '2024-01-25T06:00:00Z',
      updated_at: '2024-04-11T06:00:00Z'
    },
    {
      menu_item_id: '30000000-0000-4000-8000-000000000053',
      restaurant_id: '20000000-0000-4000-8000-000000000005',
      name: 'Cà phê sữa đá',
      description: 'Cà phê phin truyền thống pha sữa đặc',
      status: 'ACTIVE',
      diet_tags: ['VEGETARIAN'],
      created_at: '2024-01-25T06:00:00Z',
      updated_at: '2024-04-11T06:00:00Z'
    },
    {
      menu_item_id: '30000000-0000-4000-8000-000000000054',
      restaurant_id: '20000000-0000-4000-8000-000000000005',
      name: 'Combo Bánh mì + Cà phê sữa',
      description: 'Combo tiết kiệm bữa sáng',
      status: 'ACTIVE',
      diet_tags: [],
      created_at: '2024-01-25T06:00:00Z',
      updated_at: '2024-04-11T06:00:00Z'
    },

    // Phở Bò Tái Lăn - Ngụy Như Kon Tum
    {
      menu_item_id: '30000000-0000-4000-8000-000000000061',
      restaurant_id: '20000000-0000-4000-8000-000000000006',
      name: 'Phở bò chín nạm',
      description: 'Nước dùng đậm đà truyền thống',
      status: 'ACTIVE',
      diet_tags: ['HIGH_PROTEIN'],
      created_at: '2024-02-01T06:00:00Z',
      updated_at: '2024-03-28T06:00:00Z'
    },
    {
      menu_item_id: '30000000-0000-4000-8000-000000000062',
      restaurant_id: '20000000-0000-4000-8000-000000000006',
      name: 'Phở bò tái lăn',
      description: 'Thịt bò xào lăn thơm mùi tỏi gừng',
      status: 'ACTIVE',
      diet_tags: ['HIGH_PROTEIN'],
      created_at: '2024-02-01T06:00:00Z',
      updated_at: '2024-03-28T06:00:00Z'
    }
  ],

  // 7. PRICE_ASSERTION (At most one row per menu_item_id with is_current = true; none = NO_PRICE)
  // No status / verified_at / verified_by / observed_at: verification belongs to RESTAURANT.verified_at.
  // created_at = when this price row was recorded (Admin approval time, or import time for seeded rows).
  PRICE_ASSERTION: [
    // Historical (is_current = false) assertion for Phở bò chín (158 Quan Nhân) demonstrating immutable history
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000000',
      menu_item_id: '30000000-0000-4000-8000-000000000001',
      min_price: 40000,
      max_price: 40000,
      currency: 'VND',
      is_current: false,
      source_type: 'OSM_TAG',
      source_reference: 'osm:price:2023',
      created_at: '2023-06-01T07:00:00Z'
    },
    // Pho Bo 158 (current assertions)
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000001',
      menu_item_id: '30000000-0000-4000-8000-000000000001',
      min_price: 45000,
      max_price: 45000,
      currency: 'VND',
      is_current: true,
      source_type: 'MENU_PHOTO',
      source_reference: 'menu-board-2024-01.jpg',
      created_at: '2024-01-15T07:30:00Z'
    },
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000002',
      menu_item_id: '30000000-0000-4000-8000-000000000002',
      min_price: 50000,
      max_price: 50000,
      currency: 'VND',
      is_current: true,
      source_type: 'MENU_PHOTO',
      source_reference: 'menu-board-2024-01.jpg',
      created_at: '2024-01-15T07:30:00Z'
    },
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000003',
      menu_item_id: '30000000-0000-4000-8000-000000000003',
      min_price: 55000,
      max_price: 55000,
      currency: 'VND',
      is_current: true,
      source_type: 'MENU_PHOTO',
      source_reference: 'menu-board-2024-01.jpg',
      created_at: '2024-01-15T07:30:00Z'
    },
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000004',
      menu_item_id: '30000000-0000-4000-8000-000000000004',
      min_price: 65000,
      max_price: 65000,
      currency: 'VND',
      is_current: true,
      source_type: 'MENU_PHOTO',
      source_reference: 'menu-board-2024-01.jpg',
      created_at: '2024-01-15T07:30:00Z'
    },
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000005',
      menu_item_id: '30000000-0000-4000-8000-000000000005',
      min_price: 5000,
      max_price: 5000,
      currency: 'VND',
      is_current: true,
      source_type: 'COMMUNITY_REPORT',
      source_reference: 'report:50000001',
      created_at: '2024-01-15T07:30:00Z'
    },

    // Mạnh Đạt
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000021',
      menu_item_id: '30000000-0000-4000-8000-000000000021',
      min_price: 40000,
      max_price: 40000,
      currency: 'VND',
      is_current: true,
      source_type: 'OSM_TAG',
      source_reference: 'osm:881234002',
      created_at: '2024-03-01T07:00:00Z'
    },
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000022',
      menu_item_id: '30000000-0000-4000-8000-000000000022',
      min_price: 45000,
      max_price: 45000,
      currency: 'VND',
      is_current: true,
      source_type: 'COMMUNITY_REPORT',
      source_reference: 'report:50000021',
      created_at: '2024-03-05T07:00:00Z'
    },
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000023',
      menu_item_id: '30000000-0000-4000-8000-000000000023',
      min_price: 50000,
      max_price: 55000,
      currency: 'VND',
      is_current: true,
      source_type: 'OSM_TAG',
      source_reference: 'osm:881234002:old',
      created_at: '2023-09-01T07:00:00Z'
    },

    // Phở Bò Nam Định - Hoàng Ngân
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000030',
      menu_item_id: '30000000-0000-4000-8000-000000000031',
      min_price: 30000,
      max_price: 30000,
      currency: 'VND',
      is_current: false,
      source_type: 'OSM_TAG',
      source_reference: 'osm:namdinh:2023',
      created_at: '2023-10-01T07:00:00Z'
    },
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000031',
      menu_item_id: '30000000-0000-4000-8000-000000000031',
      min_price: 35000,
      max_price: 35000,
      currency: 'VND',
      is_current: true,
      source_type: 'ADMIN_SURVEY',
      source_reference: 'survey-2024-02',
      created_at: '2024-02-10T07:00:00Z'
    },
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000032',
      menu_item_id: '30000000-0000-4000-8000-000000000032',
      min_price: 40000,
      max_price: 40000,
      currency: 'VND',
      is_current: true,
      source_type: 'ADMIN_SURVEY',
      source_reference: 'survey-2024-02',
      created_at: '2024-02-10T07:00:00Z'
    },
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000033',
      menu_item_id: '30000000-0000-4000-8000-000000000033',
      min_price: 50000,
      max_price: 50000,
      currency: 'VND',
      is_current: true,
      source_type: 'COMMUNITY_REPORT',
      source_reference: 'report:50000031',
      created_at: '2024-02-15T07:00:00Z'
    },

    // Bún Riêu Cua Cô Hương
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000041',
      menu_item_id: '30000000-0000-4000-8000-000000000041',
      min_price: 35000,
      max_price: 35000,
      currency: 'VND',
      is_current: true,
      source_type: 'MENU_PHOTO',
      source_reference: 'menu-bunrieu-2024.jpg',
      created_at: '2024-04-01T07:00:00Z'
    },
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000042',
      menu_item_id: '30000000-0000-4000-8000-000000000042',
      min_price: 45000,
      max_price: 50000,
      currency: 'VND',
      is_current: true,
      source_type: 'MENU_PHOTO',
      source_reference: 'menu-bunrieu-2024.jpg',
      created_at: '2024-04-01T07:00:00Z'
    },
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000043',
      menu_item_id: '30000000-0000-4000-8000-000000000043',
      min_price: 10000,
      max_price: 10000,
      currency: 'VND',
      is_current: true,
      source_type: 'MENU_PHOTO',
      source_reference: 'menu-bunrieu-2024.jpg',
      created_at: '2024-04-01T07:00:00Z'
    },

    // Bánh Mì Pate & Cà Phê Phố Cũ
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000051',
      menu_item_id: '30000000-0000-4000-8000-000000000051',
      min_price: 20000,
      max_price: 20000,
      currency: 'VND',
      is_current: true,
      source_type: 'PARTNER_FEED',
      source_reference: 'partner:bm-42',
      created_at: '2024-04-05T07:00:00Z'
    },
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000052',
      menu_item_id: '30000000-0000-4000-8000-000000000052',
      min_price: 25000,
      max_price: 25000,
      currency: 'VND',
      is_current: true,
      source_type: 'PARTNER_FEED',
      source_reference: 'partner:bm-42',
      created_at: '2024-04-05T07:00:00Z'
    },
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000053',
      menu_item_id: '30000000-0000-4000-8000-000000000053',
      min_price: 20000,
      max_price: 20000,
      currency: 'VND',
      is_current: true,
      source_type: 'PARTNER_FEED',
      source_reference: 'partner:bm-42',
      created_at: '2024-04-05T07:00:00Z'
    },
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000054',
      menu_item_id: '30000000-0000-4000-8000-000000000054',
      min_price: 35000,
      max_price: 35000,
      currency: 'VND',
      is_current: true,
      source_type: 'PARTNER_FEED',
      source_reference: 'partner:bm-42',
      created_at: '2024-04-05T07:00:00Z'
    },

    // Phở Bò Tái Lăn - Ngụy Như Kon Tum
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000061',
      menu_item_id: '30000000-0000-4000-8000-000000000061',
      min_price: 45000,
      max_price: 45000,
      currency: 'VND',
      is_current: true,
      source_type: 'COMMUNITY_REPORT',
      source_reference: 'report:50000061',
      created_at: '2024-02-20T07:00:00Z'
    },
    {
      price_assertion_id: '40000000-0000-4000-8000-000000000062',
      menu_item_id: '30000000-0000-4000-8000-000000000062',
      min_price: 50000,
      max_price: 60000,
      currency: 'VND',
      is_current: true,
      source_type: 'COMMUNITY_REPORT',
      source_reference: 'report:50000062',
      created_at: '2024-02-20T07:00:00Z'
    }
  ],

  // 8. PRICE_REPORT (no observed_at: the effective date of an approved price is PRICE_REPORT.reviewed_at = Admin approval time)
  // report_type: WRONG_PRICE (price_assertion_id != null) | MISSING_PRICE (price_assertion_id == null)
  // moderation_status: PENDING | APPROVED | REJECTED
  PRICE_REPORT: [
    {
      price_report_id: '50000000-0000-4000-8000-000000000001',
      price_assertion_id: '40000000-0000-4000-8000-000000000001',
      menu_item_id: '30000000-0000-4000-8000-000000000001',
      submitted_by: '00000000-0000-4000-8000-000000000003',
      report_type: 'WRONG_PRICE',
      observed_price: 48000,
      comment: 'Quán mới tăng giá Phở bò chín lên 48k, giá hiển thị 45k bị cũ',
      evidence_uri: 'https://img.muagiday.vn/evidence/phobo158-menu.jpg',
      moderation_status: 'PENDING',
      reviewed_by: null,
      review_note: null,
      submitted_at: '2024-04-12T07:35:00Z',
      reviewed_at: null
    },
    {
      price_report_id: '50000000-0000-4000-8000-000000000021',
      price_assertion_id: '40000000-0000-4000-8000-000000000021',
      menu_item_id: '30000000-0000-4000-8000-000000000021',
      submitted_by: '00000000-0000-4000-8000-000000000004',
      report_type: 'WRONG_PRICE',
      observed_price: 45000,
      comment: 'Bát phở tái chín hiện tại 45k, giá 40k bị sai',
      evidence_uri: null,
      moderation_status: 'PENDING',
      reviewed_by: null,
      review_note: null,
      submitted_at: '2024-03-05T07:15:00Z',
      reviewed_at: null
    },
    {
      price_report_id: '50000000-0000-4000-8000-000000000022',
      price_assertion_id: null,
      menu_item_id: '30000000-0000-4000-8000-000000000006',
      submitted_by: '00000000-0000-4000-8000-000000000002',
      report_type: 'MISSING_PRICE',
      observed_price: 10000,
      comment: 'Trứng gà ta chần gọi thêm giá 10k/quả',
      evidence_uri: null,
      moderation_status: 'PENDING',
      reviewed_by: null,
      review_note: null,
      submitted_at: '2024-04-14T08:00:00Z',
      reviewed_at: null
    },
    {
      price_report_id: '50000000-0000-4000-8000-000000000031',
      price_assertion_id: '40000000-0000-4000-8000-000000000030',
      menu_item_id: '30000000-0000-4000-8000-000000000031',
      submitted_by: '00000000-0000-4000-8000-000000000005',
      report_type: 'WRONG_PRICE',
      observed_price: 35000,
      comment: 'Đã cập nhật bảng giá mới 35k',
      evidence_uri: 'https://img.muagiday.vn/evidence/namdinh-menu.jpg',
      moderation_status: 'APPROVED',
      reviewed_by: '00000000-0000-4000-8000-000000000001',
      review_note: 'Đã kiểm tra ảnh bảng giá và cập nhật lên 35k',
      submitted_at: '2024-02-12T07:10:00Z',
      reviewed_at: '2024-02-12T08:00:00Z'
    }
  ],

  // 9. REVIEW (Restaurant experience review, separated from PRICE_REPORT)
  REVIEW: [
    {
      review_id: '60000000-0000-4000-8000-000000000001',
      restaurant_id: '20000000-0000-4000-8000-000000000001',
      author_user_id: '00000000-0000-4000-8000-000000000003',
      rating: 5,
      body: 'Ông chủ thái thịt dày, nước dùng cực ngon, thái độ thân thiện với khách hàng, không gian quán rộng rãi, chỗ để xe thoải mái.',
      status: 'PUBLISHED',
      created_at: '2024-01-15T07:35:00Z',
      updated_at: '2024-01-15T07:35:00Z'
    },
    {
      review_id: '60000000-0000-4000-8000-000000000021',
      restaurant_id: '20000000-0000-4000-8000-000000000002',
      author_user_id: '00000000-0000-4000-8000-000000000004',
      rating: 5,
      body: 'Phở bò nước trong, vị thanh, cơm rang dưa bò hạt săn giòn. Giờ sáng phục vụ rất nhanh không phải đợi lâu.',
      status: 'PUBLISHED',
      created_at: '2024-03-05T07:15:00Z',
      updated_at: '2024-03-05T07:15:00Z'
    },
    {
      review_id: '60000000-0000-4000-8000-000000000031',
      restaurant_id: '20000000-0000-4000-8000-000000000003',
      author_user_id: '00000000-0000-4000-8000-000000000005',
      rating: 5,
      body: 'Giá bình dân chỉ từ 35k bát phở bò đập tỏi thơm lừng chuẩn vị Nam Định, thịt bò mềm ngọt.',
      status: 'PUBLISHED',
      created_at: '2024-02-12T07:10:00Z',
      updated_at: '2024-02-12T07:10:00Z'
    },
    {
      review_id: '60000000-0000-4000-8000-000000000041',
      restaurant_id: '20000000-0000-4000-8000-000000000004',
      author_user_id: '00000000-0000-4000-8000-000000000006',
      rating: 5,
      body: 'Riêu cua đồng xịn thơm ngậy, đậu rán giòn chấm mắm tôm cực cuốn. Gọi thêm cốc trà đào 10k nữa là tròn bữa sáng!',
      status: 'PUBLISHED',
      created_at: '2024-04-02T07:05:00Z',
      updated_at: '2024-04-02T07:05:00Z'
    },
    {
      review_id: '60000000-0000-4000-8000-000000000051',
      restaurant_id: '20000000-0000-4000-8000-000000000005',
      author_user_id: '00000000-0000-4000-8000-000000000007',
      rating: 5,
      body: 'Pate gan tự làm béo ngậy không bị khô, bánh mì nướng giòn rụm. Combo bánh mì pate + cà phê sữa đá chỉ 35k quá hời.',
      status: 'PUBLISHED',
      created_at: '2024-04-06T07:05:00Z',
      updated_at: '2024-04-06T07:05:00Z'
    },
    {
      review_id: '60000000-0000-4000-8000-000000000061',
      restaurant_id: '20000000-0000-4000-8000-000000000006',
      author_user_id: '00000000-0000-4000-8000-000000000008',
      rating: 5,
      body: 'Thịt bò xào lăn thơm mùi tỏi gừng, nhiều hành lá, nước dùng béo ngậy hợp ngày mát trời.',
      status: 'PUBLISHED',
      created_at: '2024-02-20T07:10:00Z',
      updated_at: '2024-02-20T07:10:00Z'
    }
  ],

  // 10. USER_PREFERENCE (PK + FK = user_id, 1-1 with APP_USER; Guest uses localStorage until login)
  USER_PREFERENCE: [
    {
      user_id: '00000000-0000-4000-8000-000000000002',
      diet_mode: null,
      transport_mode: 'MOTORBIKE',
      settings: {
        default_budget: 50000,
        learned_stats: {
          searchCount: 17,
          chosenCount: 3,
          topCategory: 'phở, bún, mì'
        }
      },
      updated_at: '2024-04-12T08:00:00Z'
    }
  ],

  // 11. DIETARY_RESTRICTION (Matches "Bạn không ăn được gì?" in Personalization Panel)
  DIETARY_RESTRICTION: [
    { restriction_id: '71000000-0000-4000-8000-000000000001', name: 'Hải sản', keywords: ['hải sản', 'tôm', 'cua', 'cá', 'mực', 'ốc'] },
    { restriction_id: '71000000-0000-4000-8000-000000000002', name: 'Thịt bò', keywords: ['thịt bò', 'bò'] },
    { restriction_id: '71000000-0000-4000-8000-000000000003', name: 'Thịt lợn', keywords: ['thịt lợn', 'heo', 'xá xíu', 'sườn', 'giò', 'chả'] },
    { restriction_id: '71000000-0000-4000-8000-000000000004', name: 'Lòng, tiết', keywords: ['lòng', 'tiết', 'dồi', 'gan', 'pate'] },
    { restriction_id: '71000000-0000-4000-8000-000000000005', name: 'Thịt chó, mèo', keywords: ['thịt chó', 'thịt mèo'] },
    { restriction_id: '71000000-0000-4000-8000-000000000006', name: 'Đồ cay', keywords: ['cay', 'ớt', 'sa tế'] }
  ],

  // 12. USER_RESTRICTION (M-N join: APP_USER <-> DIETARY_RESTRICTION)
  USER_RESTRICTION: [],

  // 13. DISH_CATEGORY (Matches "Bạn thích món gì? chọn tối đa 3" in Personalization Panel)
  DISH_CATEGORY: [
    { dish_category_id: '72000000-0000-4000-8000-000000000001', name: 'Phở, bún, mì', icon_key: 'pho', default_query: 'Phở bò' },
    { dish_category_id: '72000000-0000-4000-8000-000000000002', name: 'Cơm', icon_key: 'com', default_query: 'Cơm rang' },
    { dish_category_id: '72000000-0000-4000-8000-000000000003', name: 'Bánh mì, xôi', icon_key: 'banhmi', default_query: 'Bánh mì pate' },
    { dish_category_id: '72000000-0000-4000-8000-000000000004', name: 'Lẩu, nướng', icon_key: 'hotpot', default_query: 'Lẩu nướng' },
    { dish_category_id: '72000000-0000-4000-8000-000000000005', name: 'Gà rán, pizza', icon_key: 'burger', default_query: 'Gà rán' },
    { dish_category_id: '72000000-0000-4000-8000-000000000006', name: 'Cà phê', icon_key: 'coffee', default_query: 'Cà phê sữa' },
    { dish_category_id: '72000000-0000-4000-8000-000000000007', name: 'Trà sữa', icon_key: 'bobatea', default_query: 'Trà đào' },
    { dish_category_id: '72000000-0000-4000-8000-000000000008', name: 'Nước ép, sinh tố', icon_key: 'juice', default_query: 'Trà đào cam sả' }
  ],

  // 14. USER_FAVORITE_DISH (M-N join: APP_USER <-> DISH_CATEGORY)
  USER_FAVORITE_DISH: [
    {
      user_id: '00000000-0000-4000-8000-000000000002',
      dish_category_id: '72000000-0000-4000-8000-000000000001'
    },
    {
      user_id: '00000000-0000-4000-8000-000000000002',
      dish_category_id: '72000000-0000-4000-8000-000000000003'
    }
  ],

  // 15. FAVORITE_RESTAURANT (M-N join: APP_USER <-> RESTAURANT)
  FAVORITE_RESTAURANT: [
    {
      user_id: '00000000-0000-4000-8000-000000000002',
      restaurant_id: '20000000-0000-4000-8000-000000000001',
      created_at: '2024-02-01T07:00:00Z'
    }
  ],

  // 16. CONTRIBUTION
  // contribution_type: NEW_RESTAURANT, RESTAURANT_CORRECTION, MENU_CORRECTION, CLOSED_REPORT
  // All proposed fields live in payload (jsonb, one JSON schema per contribution_type, with schema_version);
  // evidence_uri is a top-level nullable column;
  // restaurant_id is NULL for NEW_RESTAURANT until Admin approves and creates the RESTAURANT row.
  CONTRIBUTION: [
    {
      contribution_id: '80000000-0000-4000-8000-000000000001',
      submitted_by: '00000000-0000-4000-8000-000000000002',
      restaurant_id: null,
      contribution_type: 'NEW_RESTAURANT',
      payload: {
        schema_version: 1,
        name: 'Xôi Xéo Cô Mai - Vũ Trọng Phụng',
        address: '15 Vũ Trọng Phụng, Thanh Xuân',
        latitude: 20.9988,
        longitude: 105.8091,
        dishName: 'Xôi xéo chả mỡ',
        dishPrice: 25000,
        note: 'Quán mở bán từ 6h sáng tới 10h30'
      },
      evidence_uri: 'https://img.muagiday.vn/evidence/xoixeo-comai.jpg',
      status: 'PENDING',
      reviewed_by: null,
      review_note: null,
      submitted_at: '2024-04-15T06:30:00Z',
      reviewed_at: null
    }
  ],

  // 17. AUDIT_EVENT (Append-only polymorphic audit log)
  AUDIT_EVENT: [
    {
      audit_event_id: '90000000-0000-4000-8000-000000000001',
      actor_user_id: '00000000-0000-4000-8000-000000000001',
      entity_type: 'PRICE_ASSERTION',
      entity_id: '40000000-0000-4000-8000-000000000001',
      action: 'ADMIN_UPDATE_PRICE',
      before_data: {
        price_assertion_id: '40000000-0000-4000-8000-000000000000',
        is_current: false,
        min_price: 40000
      },
      after_data: {
        price_assertion_id: '40000000-0000-4000-8000-000000000001',
        is_current: true,
        min_price: 45000,
        max_price: 45000,
        currency: 'VND',
        source_reference: 'menu-board-2024-01.jpg'
      },
      occurred_at: '2024-01-16T09:00:00Z'
    }
  ]
};
