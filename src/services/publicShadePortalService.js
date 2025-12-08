const API_ENDPOINT = '/api/public-shade';

async function request(body) {
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage = data?.error || `Public shade portal request failed (${response.status} ${response.statusText})`;
    const error = new Error(errorMessage);
    error.data = data;
    error.status = response.status;
    throw error;
  }
  return data;
}

export const publicShadePortalService = {
  exchange(token, sessionToken) {
    return request({ action: 'exchange', token, sessionToken });
  },
  verify(token, otp) {
    return request({ action: 'verify', token, otp });
  },
  approve(token, sessionToken, shadeId) {
    return request({ action: 'approve', token, sessionToken, shadeId });
  },
  unapprove(token, sessionToken, shadeId) {
    return request({ action: 'unapprove', token, sessionToken, shadeId });
  },
  addComment(token, sessionToken, shadeId, comment) {
    return request({ action: 'comment', token, sessionToken, shadeId, comment });
  },
  getComments(token, sessionToken, shadeId = null) {
    return request({ action: 'get_comments', token, sessionToken, shadeId });
  }
};
