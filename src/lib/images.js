// Simple client-side image compression using canvas

export async function compressImage(file, { maxWidth = 1600, maxHeight = 1600, quality = 0.82 } = {}) {
  // If file is already small (<1MB), skip
  if (file.size <= 1024 * 1024) return file

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const img = await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = dataUrl
  })

  let { width, height } = img
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1)
  const targetW = Math.round(width * ratio)
  const targetH = Math.round(height * ratio)

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, targetW, targetH)

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) return file
  return new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
}

