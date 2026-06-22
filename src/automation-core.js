;(function attachBuyinAutoExplainCore(root) {
  const EXPLAIN_LABEL = '讲解'
  const CANCEL_LABEL = '取消讲解'
  const ACTION_SELECTOR = "button,[role='button'],a,[tabindex]"
  const CARD_MARKERS = ['到手价', '售出/库存', '成交金额', '曝光成交率', '营销活动', '更多数据']

  function normalizeText(value) {
    return String(value ?? '')
      .replace(/\s+/g, '')
      .trim()
  }

  function parseSeconds(value, fallback, min, max) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      return fallback
    }
    return Math.min(max, Math.max(min, Math.round(parsed)))
  }

  function parseProductIndex(value) {
    if (value === '' || value === null || value === undefined) {
      return null
    }

    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null
    }

    return Math.min(9999, Math.round(parsed))
  }

  function normalizeSettings(settings) {
    const intervalSeconds = parseSeconds(settings?.intervalSeconds, 15, 3, 3600)
    const restartDelaySeconds = parseSeconds(settings?.restartDelaySeconds, 2, 1, 60)
    const productIndex = parseProductIndex(settings?.productIndex)

    return {
      intervalSeconds,
      productIndex,
      restartDelaySeconds,
      intervalMs: intervalSeconds * 1000,
      restartDelayMs: restartDelaySeconds * 1000,
    }
  }

  function isDisabledElement(element) {
    if (!element) {
      return true
    }
    if (element.disabled) {
      return true
    }
    if (element.getAttribute?.('aria-disabled') === 'true') {
      return true
    }
    return element.classList?.contains('disabled') ?? false
  }

  function isVisibleElement(element) {
    if (!element) {
      return false
    }

    const rect = element.getBoundingClientRect?.()
    if (rect && (rect.width <= 0 || rect.height <= 0)) {
      return false
    }

    const view = element.ownerDocument?.defaultView ?? root.window
    const style = view?.getComputedStyle?.(element)
    if (!style) {
      return true
    }

    return (
      style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none'
    )
  }

  function getActionText(element) {
    return normalizeText(element?.innerText || element?.textContent)
  }

  function matchesLabel(element, label) {
    return getActionText(element) === label
  }

  function resolveClickableElement(element) {
    if (!element) {
      return null
    }
    if (element.matches?.(ACTION_SELECTOR)) {
      return element
    }
    return element.closest?.(ACTION_SELECTOR) ?? null
  }

  function getCandidates(searchRoot) {
    const primaryCandidates = Array.from(searchRoot?.querySelectorAll?.(ACTION_SELECTOR) ?? [])
    if (primaryCandidates.length > 0) {
      return primaryCandidates
    }

    const fallbackCandidates = Array.from(searchRoot?.querySelectorAll?.('*') ?? [])
      .map(resolveClickableElement)
      .filter(Boolean)

    return Array.from(new Set(fallbackCandidates))
  }

  function getAllElements(searchRoot) {
    if (!searchRoot) {
      return []
    }

    const elements = Array.from(searchRoot.querySelectorAll?.('*') ?? [])
    if (searchRoot.nodeType === 1) {
      elements.unshift(searchRoot)
    }
    return Array.from(new Set(elements))
  }

  function findActionElement(searchRoot, label) {
    return (
      getCandidates(searchRoot).find(
        element =>
          matchesLabel(element, label) && !isDisabledElement(element) && isVisibleElement(element),
      ) ?? null
    )
  }

  function looksLikeProductCard(element) {
    const text = normalizeText(element?.innerText || element?.textContent)
    if (!text) {
      return false
    }
    return CARD_MARKERS.some(marker => text.includes(marker))
  }

  function getProductIndexFromCard(element) {
    const text = normalizeText(element?.innerText || element?.textContent)
    const match = text.match(/^(\d{1,4})(?=\D)/)
    if (!match) {
      return null
    }
    return Number(match[1])
  }

  function findProductCardByIndex(documentRoot, productIndex) {
    const cards = findProductCards(documentRoot)
    return (
      cards.find(element => getProductIndexFromCard(element) === productIndex) ??
      cards[productIndex - 1] ??
      null
    )
  }

  function findProductCardRoot(actionElement) {
    let current = actionElement?.parentElement ?? null
    let depth = 0

    while (current && depth < 10) {
      if (looksLikeProductCard(current)) {
        return current
      }
      current = current.parentElement
      depth += 1
    }

    return actionElement?.parentElement ?? null
  }

  function findProductCards(documentRoot) {
    const actionCards = getCandidates(documentRoot)
      .filter(
        element => matchesLabel(element, EXPLAIN_LABEL) || matchesLabel(element, CANCEL_LABEL),
      )
      .map(findProductCardRoot)
      .filter(Boolean)

    if (actionCards.length > 0) {
      return Array.from(new Set(actionCards))
    }

    return getAllElements(documentRoot).filter(looksLikeProductCard)
  }

  function planCardAction(cardRoot, productIndex) {
    if (!cardRoot) {
      return {
        type: 'none',
        productIndex,
        reason: 'product-not-found',
      }
    }

    const cancelButton = findActionElement(cardRoot, CANCEL_LABEL)
    if (cancelButton) {
      return {
        type: 'restart',
        cancelButton,
        cardRoot,
        productIndex,
      }
    }

    const explainButton = findActionElement(cardRoot, EXPLAIN_LABEL)
    if (explainButton) {
      return {
        type: 'start',
        cardRoot,
        explainButton,
        productIndex,
      }
    }

    return {
      type: 'none',
      productIndex,
      reason: 'button-not-found',
    }
  }

  function planNextAction(documentRoot, settings) {
    const productIndex = parseProductIndex(settings?.productIndex)
    if (productIndex) {
      return planCardAction(findProductCardByIndex(documentRoot, productIndex), productIndex)
    }

    const cancelButton = findActionElement(documentRoot, CANCEL_LABEL)
    if (cancelButton) {
      return {
        type: 'restart',
        cancelButton,
        cardRoot: findProductCardRoot(cancelButton),
      }
    }

    const explainButton = findActionElement(documentRoot, EXPLAIN_LABEL)
    if (explainButton) {
      return {
        type: 'start',
        explainButton,
      }
    }

    return {
      type: 'none',
    }
  }

  function findRestartExplainButton(cardRoot, documentRoot) {
    if (cardRoot && cardRoot.isConnected !== false) {
      const sameCardButton = findActionElement(cardRoot, EXPLAIN_LABEL)
      if (sameCardButton) {
        return sameCardButton
      }
    }

    return findActionElement(documentRoot, EXPLAIN_LABEL)
  }

  function clickElement(element) {
    if (!element) {
      return false
    }
    element.scrollIntoView?.({
      block: 'center',
      inline: 'center',
      behavior: 'smooth',
    })
    element.click?.()
    return true
  }

  root.BuyinAutoExplainCore = {
    CANCEL_LABEL,
    EXPLAIN_LABEL,
    clickElement,
    findActionElement,
    findProductCardByIndex,
    findProductCardRoot,
    findProductCards,
    findRestartExplainButton,
    getProductIndexFromCard,
    isVisibleElement,
    normalizeSettings,
    normalizeText,
    planNextAction,
  }
})(globalThis)
