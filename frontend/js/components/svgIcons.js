/**
 * SVG Illustrations & UI Icons for "Mua Gì Đây" Frontend
 * Matches the illustrated food art & route map style in the screenshots.
 */

export const FoodIllustrations = {
  // Central steaming Pho bowl with chopsticks
  phoBowl: (size = 110) => `
    <svg width="${size}" height="${size}" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Shadow -->
      <ellipse cx="60" cy="103" rx="40" ry="7" fill="#E6D5C7"/>
      <!-- Steam lines -->
      <path d="M46 28C43 22 49 17 46 11" stroke="#D9C3B0" stroke-width="3" stroke-linecap="round"/>
      <path d="M60 25C57 19 63 14 60 8" stroke="#D9C3B0" stroke-width="3" stroke-linecap="round"/>
      <!-- Chopsticks -->
      <path d="M72 58L98 16" stroke="#9C5125" stroke-width="4" stroke-linecap="round"/>
      <path d="M78 60L105 21" stroke="#B56332" stroke-width="3.8" stroke-linecap="round"/>
      <!-- Bowl Rim & Soup -->
      <ellipse cx="60" cy="58" rx="44" ry="16" fill="#FFFFFF" stroke="#E2D3C5" stroke-width="2"/>
      <ellipse cx="60" cy="59" rx="39" ry="12.5" fill="#E58A3B"/>
      <!-- Noodles & Beef & Scallions -->
      <path d="M35 58C45 52 65 52 82 59" stroke="#FFF4D9" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M40 63C52 57 68 57 78 63" stroke="#FFF4D9" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="49" cy="56" rx="9" ry="4.5" fill="#9E3B24"/>
      <ellipse cx="63" cy="58" rx="8" ry="4" fill="#B0462D"/>
      <circle cx="42" cy="60" r="2.5" fill="#4D9B46"/>
      <circle cx="72" cy="56" r="2.5" fill="#4D9B46"/>
      <circle cx="56" cy="62" r="2" fill="#4D9B46"/>
      <!-- Bowl Body -->
      <path d="M16 58C18 85 36 98 60 98C84 98 102 85 104 58H16Z" fill="#F7F5F2"/>
      <!-- Blue traditional stripe -->
      <path d="M19 69C33 76 87 76 101 69" stroke="#365899" stroke-width="4.5" stroke-linecap="round"/>
      <!-- Bowl Base -->
      <rect x="43" y="95" width="34" height="6" rx="3" fill="#DED7CE"/>
    </svg>
  `,

  // Crispy Vietnamese Banh Mi
  banhMi: (size = 82) => `
    <svg width="${size}" height="${size}" viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="67" rx="36" ry="6" fill="#E6D5C7"/>
      <g transform="rotate(-14 50 42)">
        <!-- Bread body -->
        <rect x="14" y="24" width="72" height="34" rx="17" fill="#D4742C"/>
        <path d="M20 38C36 47 64 47 80 38" stroke="#A84F14" stroke-width="2"/>
        <!-- Filling (Herbs, Meat, Chili) -->
        <path d="M22 29C32 21 44 25 54 22C64 19 72 25 78 29" stroke="#4E9A44" stroke-width="5" stroke-linecap="round"/>
        <ellipse cx="42" cy="29" rx="11" ry="4" fill="#C94A38"/>
        <ellipse cx="60" cy="29" rx="11" ry="4" fill="#E08B6B"/>
        <!-- Score marks -->
        <path d="M32 35L42 42" stroke="#F4B176" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M48 35L58 42" stroke="#F4B176" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M64 35L72 41" stroke="#F4B176" stroke-width="2.5" stroke-linecap="round"/>
      </g>
    </svg>
  `,

  // Iced Milk Coffee (Cà phê sữa đá)
  icedCoffee: (size = 76) => `
    <svg width="${size}" height="${size}" viewBox="0 0 80 95" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="40" cy="84" rx="24" ry="5" fill="#E6D5C7"/>
      <g transform="rotate(6 40 48)">
        <!-- Cup lid -->
        <rect x="26" y="14" width="28" height="8" rx="3" fill="#D0DAE5"/>
        <rect x="22" y="21" width="36" height="6" rx="3" fill="#E2E8F0"/>
        <!-- Cup body -->
        <path d="M25 27H55L51 77C50.8 79.5 48.7 81 46.2 81H33.8C31.3 81 29.2 79.5 29 77L25 27Z" fill="#633722"/>
        <!-- Milk layer & Ice cubes -->
        <path d="M25.5 34H54.5L53.5 46H26.5L25.5 34Z" fill="#B88766"/>
        <rect x="30" y="36" width="8" height="7" rx="2" fill="#F5EBE2" fill-opacity="0.7"/>
        <rect x="41" y="37" width="8" height="7" rx="2" fill="#F5EBE2" fill-opacity="0.7"/>
      </g>
    </svg>
  `,

  // Broken Rice Plate (Cơm tấm sườn trứng)
  ricePlate: (size = 84) => `
    <svg width="${size}" height="${size}" viewBox="0 0 110 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="55" cy="65" rx="42" ry="7" fill="#E6D5C7"/>
      <ellipse cx="55" cy="52" rx="44" ry="16" fill="#FFFFFF" stroke="#E5DDD5" stroke-width="2"/>
      <!-- Rice mound -->
      <path d="M22 48C22 36 35 30 48 34C56 36 60 44 58 50H22Z" fill="#F7F4EE"/>
      <!-- Fried Egg -->
      <ellipse cx="42" cy="53" rx="12" ry="6" fill="#FFFDF9"/>
      <circle cx="42" cy="53" r="4.5" fill="#F59E0B"/>
      <!-- Grilled Pork Chop -->
      <ellipse cx="69" cy="49" rx="16" ry="8" fill="#8C3B20"/>
      <path d="M61 46L66 52M68 45L73 51M75 46L79 51" stroke="#5E2310" stroke-width="2" stroke-linecap="round"/>
      <!-- Cucumber & Tomato -->
      <circle cx="62" cy="58" r="3.5" fill="#52A447"/>
      <circle cx="70" cy="59" r="3.5" fill="#E04F3E"/>
    </svg>
  `,

  // Peach Tea / Boba Milk Tea (Trà đào / Trà sữa)
  peachTea: (size = 78) => `
    <svg width="${size}" height="${size}" viewBox="0 0 85 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="42" cy="89" rx="25" ry="5" fill="#E6D5C7"/>
      <g transform="rotate(-5 42 52)">
        <!-- Red Straw -->
        <rect x="40" y="8" width="5" height="26" rx="2" fill="#D9381E"/>
        <!-- Dome Lid -->
        <ellipse cx="42" cy="30" rx="22" ry="6" fill="#FFFDFB"/>
        <!-- Cup Body -->
        <path d="M22 30H62L57 82C56.7 84.5 54.5 86 52 86H32C29.5 86 27.3 84.5 27 82L22 30Z" fill="#E3B788"/>
        <!-- Boba pearls -->
        <circle cx="33" cy="79" r="3" fill="#2B1B12"/>
        <circle cx="41" cy="80" r="3" fill="#2B1B12"/>
        <circle cx="49" cy="79" r="3" fill="#2B1B12"/>
        <circle cx="37" cy="73" r="3" fill="#2B1B12"/>
        <circle cx="45" cy="74" r="3" fill="#2B1B12"/>
      </g>
    </svg>
  `,

  // Mini Route Map SVG (Matches Screenshots 7 & 8)
  miniRouteMap: () => `
    <svg class="minimap-svg-bg" viewBox="0 0 400 140" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <!-- Map base land -->
      <rect width="400" height="140" fill="#EFE8DC"/>
      <!-- Green park area (Công viên Thanh Xuân) -->
      <path d="M75 45L140 35L148 90L82 98Z" fill="#C8E6C9"/>
      <text x="92" y="66" fill="#2E7D32" font-size="8.5" font-weight="700" font-family="sans-serif">Công viên</text>
      <text x="90" y="77" fill="#2E7D32" font-size="8.5" font-weight="700" font-family="sans-serif">Thanh Xuân</text>
      <!-- Water lake inside park -->
      <ellipse cx="115" cy="52" rx="14" ry="8" fill="#90CAF9"/>
      <!-- Major Roads -->
      <path d="M-10 115L180 20L390 -10" stroke="#F7D996" stroke-width="10"/>
      <path d="M60 -10L165 150" stroke="#FFFFFF" stroke-width="7"/>
      <path d="M210 -10L260 150" stroke="#FFFFFF" stroke-width="6"/>
      <path d="M0 75L400 95" stroke="#FFFFFF" stroke-width="5"/>
      <path d="M140 140L320 20" stroke="#FFFFFF" stroke-width="4"/>
      <!-- Area labels -->
      <text x="172" y="114" fill="#7D7265" font-size="9" font-weight="700" font-family="sans-serif">THANH XUÂN</text>
      <text x="255" y="76" fill="#6E6357" font-size="9.5" font-weight="800" font-family="sans-serif">KẺ MỘC</text>
      <!-- Dotted Blue Navigation Route from User to Restaurant -->
      <path d="M126 88 Q 195 54 272 48" stroke="#1D5BD6" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="1 9"/>
      <!-- User Current Location Dot (Blue Circle) -->
      <circle cx="126" cy="88" r="8" fill="#FFFFFF"/>
      <circle cx="126" cy="88" r="5.5" fill="#1D5BD6"/>
      <!-- Destination Pin (Terracotta Red Pin) -->
      <g transform="translate(256, 12)">
        <path d="M16 0C7.2 0 0 7.2 0 16C0 27.2 16 38 16 38C16 38 32 27.2 32 16C32 7.2 24.8 0 16 0Z" fill="#D6451B" stroke="#FFFFFF" stroke-width="2.5"/>
        <circle cx="16" cy="15" r="5.5" fill="#FFFFFF"/>
      </g>
    </svg>
  `
};

export function getDishIllustration(categoryOrDish, size = 48) {
  const text = (categoryOrDish || '').toLowerCase();
  if (text.includes('bánh mì') || text.includes('banh mi')) {
    return FoodIllustrations.banhMi(size);
  }
  if (text.includes('cà phê') || text.includes('cafe') || text.includes('coffee')) {
    return FoodIllustrations.icedCoffee(size);
  }
  if (text.includes('cơm') || text.includes('xôi')) {
    return FoodIllustrations.ricePlate(size);
  }
  if (text.includes('trà') || text.includes('nước')) {
    return FoodIllustrations.peachTea(size);
  }
  return FoodIllustrations.phoBowl(size);
}
