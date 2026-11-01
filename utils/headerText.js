function decodeHeaderText(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  try {
    return decodeURIComponent(text)
  } catch (error) {
    return text
  }
}

module.exports = {
  decodeHeaderText
}
