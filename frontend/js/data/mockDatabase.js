/**
 * Mock Database for "Mua Gì Đây" Frontend
 * Contains exact data from the screenshots + rich breakfast places around 68 Lê Văn Lương, Thanh Xuân.
 */

export const USER_LOCATIONS = [
  {
    id: 'le-van-luong',
    shortLabel: '68 Lê Văn...',
    fullAddress: '68 Lê Văn Lương, Nhân Chính, Thanh Xuân',
    lat: 21.0048,
    lng: 105.8042
  },
  {
    id: 'bach-khoa',
    shortLabel: 'ĐH Bách Khoa',
    fullAddress: '1 Đại Cồ Việt, Bách Khoa, Hai Bà Trưng',
    lat: 21.0051,
    lng: 105.8432
  },
  {
    id: 'cau-giay',
    shortLabel: 'Duy Tân, CG',
    fullAddress: '78 Duy Tân, Dịch Vọng Hậu, Cầu Giấy',
    lat: 21.0312,
    lng: 105.7829
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

export const RESTAURANTS_DB = [
  {
    id: 'pho-bo-158-quan-nhan',
    name: 'Pho Bo 158 - Quan Nhan',
    categoryLabel: 'Quán phở',
    dishKeywords: ['phở bò', 'pho bo', 'phở', 'pho', 'ăn sáng'],
    address: '156 P. Quan Nhân, Nhân Chính, Thanh Xuân',
    distanceKm: 1.4,
    travelMinutes: 9,
    openUntil: '21:00',
    isPriceVerified: true,
    minPrice: 45000,
    maxPrice: 65000,
    rating: 5.0,
    reviewCount: 1,
    mapPos: { x: 68, y: 34 },
    featuredReview: {
      quote: 'Ông chủ thái thịt dày, nước dùng cực ngon, thái độ thân thiện với khách hàng, không gian quán rộng rãi, chỗ để xe thoải mái.',
      rating: 5,
      date: '1/2024',
      author: 'Khách hàng ẩn danh'
    },
    menu: [
      { id: 'm1', name: 'Phở bò chín', price: 45000, isPopular: true },
      { id: 'm2', name: 'Phở bò tái', price: 50000, isPopular: true },
      { id: 'm3', name: 'Phở tái nạm gầu', price: 55000, isPopular: false },
      { id: 'm4', name: 'Phở bò đặc biệt', price: 65000, isPopular: false },
      { id: 'm5', name: 'Quẩy giòn (đĩa)', price: 5000, isPopular: false }
    ],
    feedbacks: [
      {
        id: 'fb1',
        author: 'Minh Hoàng',
        rating: 5,
        date: '1/2024',
        comment: 'Ông chủ thái thịt dày, nước dùng cực ngon, thái độ thân thiện với khách hàng, không gian quán rộng rãi, chỗ để xe thoải mái.',
        verifiedPrice: '45k - 50k đúng giá'
      }
    ]
  },
  {
    id: 'manh-dat-pho-bo-com-rang',
    name: 'Mạnh Đạt - Phở Bò, Cơm Rang',
    categoryLabel: 'Quán phở & Cơm',
    dishKeywords: ['phở bò', 'pho bo', 'phở', 'cơm rang', 'cơm', 'ăn sáng'],
    address: '82 Vũ Trọng Phụng, Thanh Xuân Trung, Thanh Xuân',
    distanceKm: 1.06,
    comparisonBadge: 'Gần hơn 340m',
    travelMinutes: 8,
    openUntil: '22:00',
    isPriceVerified: false,
    minPrice: 40000,
    maxPrice: 55000,
    rating: 4.7,
    reviewCount: 14,
    mapPos: { x: 48, y: 52 },
    featuredReview: {
      quote: 'Phở bò nước trong, vị thanh, cơm rang dưa bò hạt săn giòn. Giờ sáng phục vụ rất nhanh không phải đợi lâu.',
      rating: 5,
      date: '3/2024',
      author: 'Tuấn Anh'
    },
    menu: [
      { id: 'm21', name: 'Phở bò tái chín', price: 40000, isPopular: true },
      { id: 'm22', name: 'Cơm rang dưa bò', price: 45000, isPopular: true },
      { id: 'm23', name: 'Phở bò bắp trần', price: 50000, isPopular: false }
    ],
    feedbacks: [
      {
        id: 'fb21',
        author: 'Tuấn Anh',
        rating: 5,
        date: '3/2024',
        comment: 'Phở bò nước trong, vị thanh, cơm rang dưa bò hạt săn giòn. Giờ sáng phục vụ rất nhanh không phải đợi lâu.',
        verifiedPrice: 'Ước tính 40k - 50k'
      }
    ]
  },
  {
    id: 'pho-bo-gia-truyen-hoang-ngan',
    name: 'Phở Bò Nam Định - Hoàng Ngân',
    categoryLabel: 'Quán phở',
    dishKeywords: ['phở bò', 'pho bo', 'phở', 'ăn sáng'],
    address: '112 Hoàng Ngân, Trung Hòa, Cầu Giấy',
    distanceKm: 0.85,
    comparisonBadge: 'Gần hơn 550m',
    travelMinutes: 6,
    openUntil: '14:00',
    isPriceVerified: true,
    minPrice: 35000,
    maxPrice: 50000,
    rating: 4.8,
    reviewCount: 28,
    mapPos: { x: 35, y: 28 },
    featuredReview: {
      quote: 'Giá bình dân chỉ từ 35k bát phở bò đập tỏi thơm lừng chuẩn vị Nam Định, thịt bò mềm ngọt.',
      rating: 5,
      date: '2/2024',
      author: 'Hồng Nhung'
    },
    menu: [
      { id: 'm31', name: 'Phở bò chín', price: 35000, isPopular: true },
      { id: 'm32', name: 'Phở bò tái đập tỏi', price: 40000, isPopular: true },
      { id: 'm33', name: 'Phở tái gầu', price: 50000, isPopular: false }
    ],
    feedbacks: [
      {
        id: 'fb31',
        author: 'Hồng Nhung',
        rating: 5,
        date: '2/2024',
        comment: 'Giá bình dân chỉ từ 35k bát phở bò đập tỏi thơm lừng chuẩn vị Nam Định, thịt bò mềm ngọt.',
        verifiedPrice: '35k - 50k đúng giá'
      }
    ]
  },
  {
    id: 'bun-rieu-cua-co-huong',
    name: 'Bún Riêu Cua Cô Hương - Nhân Chính',
    categoryLabel: 'Quán bún riêu',
    dishKeywords: ['bún riêu', 'bun rieu', 'bún riêu cua', 'bún', 'trà đào', 'ăn sáng'],
    address: '24 Ngõ 116 Nhân Hòa, Nhân Chính, Thanh Xuân',
    distanceKm: 0.9,
    comparisonBadge: 'Rất gần bạn',
    travelMinutes: 6,
    openUntil: '13:30',
    isPriceVerified: true,
    minPrice: 35000,
    maxPrice: 50000,
    rating: 4.9,
    reviewCount: 42,
    mapPos: { x: 56, y: 65 },
    featuredReview: {
      quote: 'Riêu cua đồng xịn thơm ngậy, đậu rán giòn chấm mắm tôm cực cuốn. Gọi thêm cốc trà đào 10k nữa là tròn bữa sáng!',
      rating: 5,
      date: '4/2024',
      author: 'Thu Hà'
    },
    menu: [
      { id: 'm41', name: 'Bún riêu cua đậu', price: 35000, isPopular: true },
      { id: 'm42', name: 'Bún riêu bò giò', price: 45000, isPopular: true },
      { id: 'm43', name: 'Trà đào cam sả', price: 10000, isPopular: true }
    ],
    feedbacks: [
      {
        id: 'fb41',
        author: 'Thu Hà',
        rating: 5,
        date: '4/2024',
        comment: 'Riêu cua đồng xịn thơm ngậy, đậu rán giòn chấm mắm tôm cực cuốn. Gọi thêm cốc trà đào 10k nữa là tròn bữa sáng!',
        verifiedPrice: '35k - 45k đúng giá'
      }
    ]
  },
  {
    id: 'banh-mi-pate-chao-le-van-luong',
    name: 'Bánh Mì Pate & Cà Phê Phố Cũ',
    categoryLabel: 'Bánh mì & Cà phê',
    dishKeywords: ['bánh mì', 'banh mi', 'bánh mì pate', 'cà phê', 'ca phe', 'cà phê sữa', 'ăn sáng'],
    address: '42 Lê Văn Lương, Nhân Chính, Thanh Xuân',
    distanceKm: 0.45,
    comparisonBadge: 'Gần hơn 950m',
    travelMinutes: 3,
    openUntil: '20:00',
    isPriceVerified: true,
    minPrice: 20000,
    maxPrice: 35000,
    rating: 4.8,
    reviewCount: 65,
    mapPos: { x: 42, y: 74 },
    featuredReview: {
      quote: 'Pate gan tự làm béo ngậy không bị khô, bánh mì nướng giòn rụm. Combo bánh mì pate + cà phê sữa đá chỉ 35k quá hời.',
      rating: 5,
      date: '4/2024',
      author: 'Đức Phúc'
    },
    menu: [
      { id: 'm51', name: 'Bánh mì pate trứng', price: 20000, isPopular: true },
      { id: 'm52', name: 'Bánh mì pate xá xíu', price: 25000, isPopular: true },
      { id: 'm53', name: 'Cà phê sữa đá', price: 20000, isPopular: true },
      { id: 'm54', name: 'Combo Bánh mì + Cà phê sữa', price: 35000, isPopular: true }
    ],
    feedbacks: [
      {
        id: 'fb51',
        author: 'Đức Phúc',
        rating: 5,
        date: '4/2024',
        comment: 'Pate gan tự làm béo ngậy không bị khô, bánh mì nướng giòn rụm. Combo bánh mì pate + cà phê sữa đá chỉ 35k quá hời.',
        verifiedPrice: '20k - 35k đúng giá'
      }
    ]
  },
  {
    id: 'pho-thin-lo-duc-chi-nhanh',
    name: 'Phở Bò Tái Lăn - Ngụy Như Kon Tum',
    categoryLabel: 'Quán phở',
    dishKeywords: ['phở bò', 'pho bo', 'phở', 'ăn sáng'],
    address: '95 Ngụy Như Kon Tum, Nhân Chính, Thanh Xuân',
    distanceKm: 1.2,
    comparisonBadge: 'Gần hơn 200m',
    travelMinutes: 7,
    openUntil: '21:30',
    isPriceVerified: true,
    minPrice: 45000,
    maxPrice: 60000,
    rating: 4.6,
    reviewCount: 19,
    mapPos: { x: 75, y: 62 },
    featuredReview: {
      quote: 'Thịt bò xào lăn thơm mùi tỏi gừng, nhiều hành lá, nước dùng béo ngậy hợp ngày mát trời.',
      rating: 5,
      date: '2/2024',
      author: 'Quốc Khánh'
    },
    menu: [
      { id: 'm61', name: 'Phở bò chín nạm', price: 45000, isPopular: true },
      { id: 'm62', name: 'Phở bò tái lăn', price: 50000, isPopular: true }
    ],
    feedbacks: [
      {
        id: 'fb61',
        author: 'Quốc Khánh',
        rating: 5,
        date: '2/2024',
        comment: 'Thịt bò xào lăn thơm mùi tỏi gừng, nhiều hành lá, nước dùng béo ngậy hợp ngày mát trời.',
        verifiedPrice: '45k - 50k đúng giá'
      }
    ]
  }
];
