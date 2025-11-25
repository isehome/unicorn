const API_ENDPOINT = '/api/public-po';

async function request(body) {
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || 'Vendor portal request failed');
    error.data = data;
    throw error;
  }
  return data;
}

export const publicPOPortalService = {
  exchange(token) {
    return request({ action: 'exchange', token });
  },
  submit(token, payload) {
    return request({ action: 'submit', token, ...payload });
  }
};
