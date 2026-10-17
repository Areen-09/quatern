export const movingAverage = (s: number[], w = 7) => {
  const t = s.slice(-w)
  return t.length ? t.reduce((a, b) => a + b, 0) / t.length : 0
}
export const expSmoothing = (s: number[], alpha = 0.3) => {
  if (!s.length) return 0
  let level = s[0]
  for (let i = 1; i < s.length; i++) level = alpha * s[i] + (1 - alpha) * level
  return level
}
