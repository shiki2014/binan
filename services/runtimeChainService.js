const { getSettings } = require('./systemSettingsService')

function normalizePrimaryChain(value) {
  const mode = String(value || '').trim().toLowerCase()
  return mode === 'db' ? 'db' : 'file'
}

function resolveRuntimeChain(settings = {}) {
  const primaryChain = normalizePrimaryChain(settings.runtime_primary_chain)
  const rollbackEnabled = Boolean(settings.runtime_force_file_rollback)
  let effectiveChain = rollbackEnabled ? 'file' : primaryChain
  let fallbackReason = ''

  if (rollbackEnabled) {
    fallbackReason = 'manual_force_file_rollback'
  }

  return {
    primaryChain,
    rollbackEnabled,
    effectiveChain,
    fallbackReason,
    dbMainChainEnabled: true
  }
}

async function getRuntimeChainStatus(settings) {
  const resolvedSettings = settings || await getSettings()
  return resolveRuntimeChain(resolvedSettings)
}

module.exports = {
  normalizePrimaryChain,
  resolveRuntimeChain,
  getRuntimeChainStatus
}
