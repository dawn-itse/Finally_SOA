export async function requestAuth(action, { portal = 'user', body } = {}) {
  const route = action === 'register' ? 'register' : 'session';
  const method = action === 'current' ? 'GET' : action === 'logout' ? 'DELETE' : 'POST';
  const query = portal === 'admin' ? '?portal=admin' : '';
  try {
    const response = await fetch(`/api/v1/auth/${route}${query}`, {
      method,
      credentials: 'same-origin',
      ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000)
    });
    if (action === 'current' && response.status === 401) return { ok: true, data: null };
    const payload = await response.json();
    if (!response.ok || !payload.success) return { ok: false, error: payload.error || 'Yêu cầu tài khoản thất bại.' };
    return { ok: true, data: payload.data ?? null };
  } catch {
    return { ok: false, error: 'Không kết nối được dịch vụ tài khoản. Vui lòng thử lại.' };
  }
}
