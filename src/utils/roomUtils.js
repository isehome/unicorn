export const normalizeRoomName = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    value = String(value);
  }
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
};

export const levenshteinDistance = (a, b) => {
  const strA = normalizeRoomName(a);
  const strB = normalizeRoomName(b);

  if (!strA.length) return strB.length;
  if (!strB.length) return strA.length;

  const matrix = Array.from({ length: strB.length + 1 }, () => new Array(strA.length + 1).fill(0));

  for (let i = 0; i <= strB.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= strA.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= strB.length; i += 1) {
    for (let j = 1; j <= strA.length; j += 1) {
      if (strB.charAt(i - 1) === strA.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }

  return matrix[strB.length][strA.length];
};

export const similarityScore = (a, b) => {
  const normalizedA = normalizeRoomName(a);
  const normalizedB = normalizeRoomName(b);

  if (!normalizedA && !normalizedB) return 1;
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;

  const distance = levenshteinDistance(normalizedA, normalizedB);
  const maxLength = Math.max(normalizedA.length, normalizedB.length);
  if (maxLength === 0) return 0;

  return (maxLength - distance) / maxLength;
};
