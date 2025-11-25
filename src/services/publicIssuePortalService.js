const API_ENDPOINT = '/api/public-issue';

async function request(body) {
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || 'Public portal request failed');
    error.data = data;
    throw error;
  }
  return data;
}

const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result || '';
    const base64 = result.toString().split(',').pop();
    resolve(base64);
  };
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

export const publicIssuePortalService = {
  exchange(token, sessionToken) {
    return request({ action: 'exchange', token, sessionToken });
  },
  verify(token, otp) {
    return request({ action: 'verify', token, otp });
  },
  addComment(token, sessionToken, comment) {
    return request({ action: 'comment', token, sessionToken, comment });
  },
  async upload(token, sessionToken, file) {
    const base64 = await toBase64(file);
    return request({
      action: 'upload',
      token,
      sessionToken,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      fileData: base64
    });
  },
  download(token, sessionToken, uploadId) {
    return request({ action: 'download', token, sessionToken, uploadId });
  }
};
