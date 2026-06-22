;(function attachBuyinAutoExplainPopup() {
  const TARGET_URL = /^https:\/\/buyin\.jinritemai\.com\/dashboard\/live\/control/
  const MESSAGE = {
    GET_STATUS: 'BUYIN_AUTO_EXPLAIN_GET_STATUS',
    START: 'BUYIN_AUTO_EXPLAIN_START',
    STOP: 'BUYIN_AUTO_EXPLAIN_STOP',
    UPDATE_SETTINGS: 'BUYIN_AUTO_EXPLAIN_UPDATE_SETTINGS',
  }
  const DEFAULT_SETTINGS = {
    intervalSeconds: 15,
    productIndex: null,
    restartDelaySeconds: 2,
  }

  const elements = {
    errorRow: document.querySelector('#errorRow'),
    intervalSeconds: document.querySelector('#intervalSeconds'),
    lastAction: document.querySelector('#lastAction'),
    lastError: document.querySelector('#lastError'),
    nextRun: document.querySelector('#nextRun'),
    productIndex: document.querySelector('#productIndex'),
    saveButton: document.querySelector('#saveButton'),
    startButton: document.querySelector('#startButton'),
    stateBadge: document.querySelector('#stateBadge'),
    stopButton: document.querySelector('#stopButton'),
    restartDelaySeconds: document.querySelector('#restartDelaySeconds'),
  }

  let activeTab = null
  let statusTimer = null

  function clampSeconds(value, fallback, min, max) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      return fallback
    }
    return Math.min(max, Math.max(min, Math.round(parsed)))
  }

  function readProductIndex() {
    if (!elements.productIndex.value) {
      return null
    }

    const parsed = Number(elements.productIndex.value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null
    }

    return Math.min(9999, Math.round(parsed))
  }

  function readFormSettings() {
    return {
      intervalSeconds: clampSeconds(
        elements.intervalSeconds.value,
        DEFAULT_SETTINGS.intervalSeconds,
        3,
        3600,
      ),
      productIndex: readProductIndex(),
      restartDelaySeconds: clampSeconds(
        elements.restartDelaySeconds.value,
        DEFAULT_SETTINGS.restartDelaySeconds,
        1,
        60,
      ),
    }
  }

  function writeFormSettings(settings) {
    elements.intervalSeconds.value = String(settings.intervalSeconds)
    elements.productIndex.value = settings.productIndex ? String(settings.productIndex) : ''
    elements.restartDelaySeconds.value = String(settings.restartDelaySeconds)
  }

  function isEditingSettings() {
    return (
      document.activeElement === elements.intervalSeconds ||
      document.activeElement === elements.productIndex ||
      document.activeElement === elements.restartDelaySeconds
    )
  }

  function setControlsEnabled(enabled) {
    elements.intervalSeconds.disabled = !enabled
    elements.productIndex.disabled = !enabled
    elements.restartDelaySeconds.disabled = !enabled
    elements.saveButton.disabled = !enabled
    elements.startButton.disabled = !enabled
    elements.stopButton.disabled = !enabled
  }

  function setBadge(text, className) {
    elements.stateBadge.textContent = text
    elements.stateBadge.className = `badge ${className || ''}`.trim()
  }

  function showError(message) {
    elements.errorRow.hidden = !message
    elements.lastError.textContent = message || ''
  }

  function formatNextRun(nextRunAt) {
    if (!nextRunAt) {
      return '-'
    }
    const remainingMs = Math.max(0, nextRunAt - Date.now())
    return `${Math.ceil(remainingMs / 1000)} 秒后`
  }

  function renderStatus(status) {
    if (!status) {
      return
    }

    elements.lastAction.textContent = status.lastAction || '未启动'
    elements.nextRun.textContent = formatNextRun(status.nextRunAt)
    showError(status.lastError)

    if (status.enabled) {
      setBadge(status.busy ? '执行中' : '运行中', 'running')
    } else {
      setBadge('已暂停', 'paused')
    }

    if (!isEditingSettings()) {
      writeFormSettings({
        intervalSeconds: status.intervalSeconds,
        productIndex: status.productIndex,
        restartDelaySeconds: status.restartDelaySeconds,
      })
    }
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    })
    return tab ?? null
  }

  function isTargetTab(tab) {
    return Boolean(tab?.id && TARGET_URL.test(tab.url || ''))
  }

  async function sendMessage(type, payload = {}) {
    if (!activeTab?.id) {
      throw new Error('没有找到当前标签页')
    }
    return chrome.tabs.sendMessage(activeTab.id, {
      ...payload,
      type,
    })
  }

  async function ensureContentScript() {
    try {
      return await sendMessage(MESSAGE.GET_STATUS)
    } catch (_error) {
      await chrome.scripting.executeScript({
        files: ['src/automation-core.js', 'src/content.js'],
        target: { tabId: activeTab.id },
      })
      return sendMessage(MESSAGE.GET_STATUS)
    }
  }

  async function saveSettings() {
    const settings = readFormSettings()
    writeFormSettings(settings)
    await chrome.storage.local.set(settings)
    return settings
  }

  async function start() {
    const settings = await saveSettings()
    const status = await sendMessage(MESSAGE.START, { settings })
    renderStatus(status)
  }

  async function stop() {
    const status = await sendMessage(MESSAGE.STOP)
    renderStatus(status)
  }

  async function updateSettings() {
    const settings = await saveSettings()
    const status = await sendMessage(MESSAGE.UPDATE_SETTINGS, { settings })
    renderStatus(status)
  }

  async function refreshStatus() {
    if (!activeTab?.id) {
      return
    }

    try {
      renderStatus(await sendMessage(MESSAGE.GET_STATUS))
    } catch (error) {
      setBadge('未注入', 'blocked')
      showError(error?.message || '无法读取页面状态，请刷新当前标签页后重试')
    }
  }

  async function initialize() {
    const storedSettings = await chrome.storage.local.get(DEFAULT_SETTINGS)
    writeFormSettings(storedSettings)
    activeTab = await getActiveTab()

    if (!isTargetTab(activeTab)) {
      setControlsEnabled(false)
      setBadge('非目标页', 'blocked')
      elements.lastAction.textContent = '请先打开百应直播商品控制页'
      showError('插件只在 buyin.jinritemai.com 的直播商品控制页运行')
      return
    }

    setControlsEnabled(true)
    renderStatus(await ensureContentScript())
    statusTimer = setInterval(refreshStatus, 1000)
  }

  elements.startButton.addEventListener('click', () => {
    start().catch(error => showError(error?.message || String(error)))
  })
  elements.stopButton.addEventListener('click', () => {
    stop().catch(error => showError(error?.message || String(error)))
  })
  elements.saveButton.addEventListener('click', () => {
    updateSettings().catch(error => showError(error?.message || String(error)))
  })

  window.addEventListener('unload', () => {
    if (statusTimer) {
      clearInterval(statusTimer)
    }
  })

  initialize().catch(error => {
    setControlsEnabled(false)
    setBadge('异常', 'blocked')
    showError(error?.message || String(error))
  })
})()
