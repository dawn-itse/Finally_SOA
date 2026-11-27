import { geoPoint, requestGeo } from '../api/geo.js';

const lookups = new WeakMap();

export function getSelectedLocation(form) {
  const field = form.querySelector('[data-goong-address]');
  if (!field) return undefined;
  const selected = lookups.get(field)?.selected;
  return selected?.address_text === field.value.trim() ? selected : undefined;
}

export function bindAddressLookup(root, getOrigin = () => null) {
  root.addEventListener('input', (event) => {
    const field = event.target.closest('[data-goong-address]');
    if (!field) return;
    const output = field.parentElement.querySelector('[data-goong-options]');
    const previous = lookups.get(field);
    clearTimeout(previous?.timer);
    previous?.controller.abort();
    field.setCustomValidity('');
    output.replaceChildren();

    const input = field.value.trim();
    const state = { controller: new AbortController(), selected: null };
    lookups.set(field, state);
    if (input.length < 3) return;

    state.timer = setTimeout(async () => {
      if (!field.isConnected) return;
      const signal = state.controller.signal;
      try {
        const origin = getOrigin();
        const params = origin ? { input, location: geoPoint(origin) } : { input };
        const choices = await requestGeo('autocomplete', params, signal);
        if (signal.aborted || !field.isConnected) return;
        if (!choices.length) output.textContent = 'Chưa có gợi ý. Bạn có thể dùng địa chỉ đã nhập.';

        for (const choice of choices) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'form-input-field geo-address-option';
          button.textContent = choice.description;
          button.addEventListener('click', async () => {
            field.setCustomValidity('Đang lấy tọa độ. Vui lòng đợi một chút.');
            output.textContent = 'Đang tải địa chỉ…';
            try {
              const location = await requestGeo('place-detail', { place_id: choice.place_id }, signal);
              if (signal.aborted || !field.isConnected) return;
              state.selected = location;
              field.value = location.address_text;
              output.textContent = 'Đã chọn địa chỉ Goong.';
            } catch {
              if (!signal.aborted) {
                output.textContent = 'Chưa lấy được tọa độ. Hãy thử chọn lại hoặc nhập địa chỉ.';
                output.append(button);
              }
            } finally {
              if (!signal.aborted) field.setCustomValidity('');
            }
          });
          output.append(button);
        }
      } catch (error) {
        if (!signal.aborted) output.textContent = `${error.message} Bạn vẫn có thể nhập địa chỉ.`;
      }
    }, 350);
  });
}
