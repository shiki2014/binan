function pad(value) {
  return String(value).padStart(2, '0')
}

function toUtcParts(date) {
  return {
    year: date.getUTCFullYear(),
    month: pad(date.getUTCMonth() + 1),
    day: pad(date.getUTCDate()),
    hours: pad(date.getUTCHours()),
    minutes: pad(date.getUTCMinutes()),
    seconds: pad(date.getUTCSeconds())
  }
}

function toDate(input = new Date()) {
  if (input instanceof Date) return new Date(input.getTime())
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`无效时间: ${input}`)
  }
  return date
}

function formatDbDate(input = new Date()) {
  const date = toDate(input)
  const parts = toUtcParts(date)
  return [
    parts.year,
    parts.month,
    parts.day
  ].join('-') + ' ' + [
    parts.hours,
    parts.minutes,
    parts.seconds
  ].join(':')
}

function shiftDate(input = new Date(), { minutes = 0, hours = 0, days = 0 } = {}) {
  const date = toDate(input)
  const deltaMs = ((Number(days) || 0) * 24 * 60 * 60 * 1000)
    + ((Number(hours) || 0) * 60 * 60 * 1000)
    + ((Number(minutes) || 0) * 60 * 1000)
  return new Date(date.getTime() + deltaMs)
}

function minutesAgo(minutes, from = new Date()) {
  return formatDbDate(shiftDate(from, { minutes: -Math.abs(Number(minutes) || 0) }))
}

function hoursAgo(hours, from = new Date()) {
  return formatDbDate(shiftDate(from, { hours: -Math.abs(Number(hours) || 0) }))
}

function daysAgo(days, from = new Date()) {
  return formatDbDate(shiftDate(from, { days: -Math.abs(Number(days) || 0) }))
}

function startOfToday(input = new Date()) {
  const date = toDate(input)
  date.setHours(0, 0, 0, 0)
  return formatDbDate(date)
}

module.exports = {
  formatDbDate,
  shiftDate,
  minutesAgo,
  hoursAgo,
  daysAgo,
  startOfToday
}
