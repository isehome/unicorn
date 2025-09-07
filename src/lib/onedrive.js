// Client-side helper to upload to OneDrive via our serverless function

export async function graphUploadViaApi({ rootUrl, subPath, file }) {
  const arrayBuffer = await file.arrayBuffer()
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
  const resp = await fetch('/api/graph-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rootUrl,
      subPath,
      filename: file.name || `photo-${Date.now()}.jpg`,
      contentType: file.type || 'image/jpeg',
      fileBase64: base64
    })
  })
  const json = await resp.json()
  if (!resp.ok) throw new Error(json.error || 'Upload failed')
  return json.url
}

