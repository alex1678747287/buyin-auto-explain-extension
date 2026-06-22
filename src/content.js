;(function attachBuyinAutoExplainContent(root) {
  if (root.__BuyinAutoExplainContentLoaded) {
    return
  }
  root.__BuyinAutoExplainContentLoaded = true

  const core = root.BuyinAutoExplainCore
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

  const state = {
    enabled: false,
    busy: false,
    lastAction: '未启动',
    lastError: '',
    nextRunAt: null,
    settings: core.normalizeSettings(DEFAULT_SETTINGS),
    timerId: null,
  }

  function sleep(ms) {
    return new Promise(resolve => root.setTimeout(resolve, ms))
  }

  function clearTimer() {
    if (state.timerId) {
      root.clearTimeout(state.timerId)
      state.timerId = null
    }
    state.nextRunAt = null
  }

  function scheduleNext(delayMs) {
    clearTimer()
    if (!state.enabled) {
      return
    }
    const delay = Math.max(0, delayMs)
    state.nextRunAt = Date.now() + delay
    state.timerId = root.setTimeout(runCycle, delay)
  }

  function getStatus() {
    return {
      busy: state.busy,
      enabled: state.enabled,
      intervalSeconds: state.settings.intervalSeconds,
      lastAction: state.lastAction,
      lastError: state.lastError,
      nextRunAt: state.nextRunAt,
      productIndex: state.settings.productIndex,
      restartDelaySeconds: state.settings.restartDelaySeconds,
      url: root.location.href,
    }
  }

  function setSettings(rawSettings) {
    state.settings = core.normalizeSettings({
      ...DEFAULT_SETTINGS,
      ...rawSettings,
    })
  }

  function start(rawSettings) {
    setSettings(rawSettings)
    state.enabled = true
    state.lastError = ''
    state.lastAction = '已启动，准备点击讲解'
    scheduleNext(0)
    return getStatus()
  }

  function stop() {
    state.enabled = false
    state.busy = false
    state.lastAction = '已暂停'
    clearTimer()
    return getStatus()
  }

  async function runCycle() {
    clearTimer()
    if (!state.enabled || state.busy) {
      return
    }

    state.busy = true

    try {
      const action = core.planNextAction(root.document, state.settings)

      if (action.type === 'restart') {
        state.lastAction = '检测到正在讲解，已点击取消讲解'
        core.clickElement(action.cancelButton)
        await sleep(state.settings.restartDelayMs)

        if (!state.enabled) {
          return
        }

        const explainButton = core.findRestartExplainButton(action.cardRoot, root.document)
        if (!explainButton) {
          state.lastError = '取消后没有找到可点击的讲解按钮'
          state.lastAction = '本轮未重新讲解'
          return
        }

        core.clickElement(explainButton)
        state.lastAction = '已重新点击讲解'
        state.lastError = ''
        return
      }

      if (action.type === 'start') {
        core.clickElement(action.explainButton)
        state.lastAction = '已点击讲解'
        state.lastError = ''
        return
      }

      state.lastAction = '未找到可点击的讲解按钮'
      state.lastError =
        action.reason === 'product-not-found'
          ? `没有找到序号 ${action.productIndex} 的商品`
          : '请确认当前页面是百应直播商品列表，且按钮可见'
    } catch (error) {
      state.lastAction = '执行失败'
      state.lastError = error?.message || String(error)
    } finally {
      state.busy = false
      if (state.enabled) {
        scheduleNext(state.settings.intervalMs)
      }
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') {
      return false
    }

    if (message.type === MESSAGE.GET_STATUS) {
      sendResponse(getStatus())
      return false
    }

    if (message.type === MESSAGE.START) {
      sendResponse(start(message.settings))
      return false
    }

    if (message.type === MESSAGE.STOP) {
      sendResponse(stop())
      return false
    }

    if (message.type === MESSAGE.UPDATE_SETTINGS) {
      setSettings(message.settings)
      if (state.enabled) {
        scheduleNext(state.settings.intervalMs)
      }
      sendResponse(getStatus())
      return false
    }

    return false
  })
})(globalThis)
