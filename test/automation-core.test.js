import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadCore() {
  const source = readFileSync(path.resolve(__dirname, '../src/automation-core.js'), 'utf8')
  const context = {
    console,
  }
  context.window = context
  context.globalThis = context
  vm.runInNewContext(source, context, {
    filename: 'automation-core.js',
  })
  return context.BuyinAutoExplainCore
}

class FakeRoot {
  constructor(elements = []) {
    this.elements = elements
    this.textContent = elements.map(element => element.textContent).join(' ')
  }

  querySelectorAll() {
    return this.elements
  }
}

class FakeElement extends FakeRoot {
  constructor(text, options = {}) {
    super(options.children || [])
    this.textContent = text
    this.disabled = options.disabled ?? false
    this.isConnected = options.isConnected ?? true
    this.parentElement = options.parentElement ?? null
    this.rect = options.rect ?? { width: 80, height: 32 }
  }

  getBoundingClientRect() {
    return this.rect
  }
}

test('plans a restart when a visible cancel explain button exists', () => {
  const core = loadCore()
  const card = new FakeElement('商品 到手价 售出/库存 营销活动 预热 更多数据 下架 取消讲解')
  const cancelButton = new FakeElement('取消讲解', { parentElement: card })
  const otherExplainButton = new FakeElement('讲解')
  const documentRoot = new FakeRoot([cancelButton, otherExplainButton])

  const action = core.planNextAction(documentRoot)

  assert.equal(action.type, 'restart')
  assert.equal(action.cancelButton, cancelButton)
  assert.equal(action.cardRoot, card)
})

test('prefers the explain button in the same product card after cancellation', () => {
  const core = loadCore()
  const sameCardExplainButton = new FakeElement('讲解')
  const otherExplainButton = new FakeElement('讲解')
  const card = new FakeElement('商品 到手价 售出/库存', {
    children: [sameCardExplainButton],
  })
  const documentRoot = new FakeRoot([otherExplainButton, sameCardExplainButton])

  const selected = core.findRestartExplainButton(card, documentRoot)

  assert.equal(selected, sameCardExplainButton)
})

test('starts the first visible enabled explain button when no product is active', () => {
  const core = loadCore()
  const hiddenExplainButton = new FakeElement('讲解', {
    rect: { width: 0, height: 0 },
  })
  const disabledExplainButton = new FakeElement('讲解', { disabled: true })
  const enabledExplainButton = new FakeElement('讲解')
  const documentRoot = new FakeRoot([
    hiddenExplainButton,
    disabledExplainButton,
    enabledExplainButton,
  ])

  const action = core.planNextAction(documentRoot)

  assert.equal(action.type, 'start')
  assert.equal(action.explainButton, enabledExplainButton)
})

test('starts the explain button from the configured product index', () => {
  const core = loadCore()
  const firstExplainButton = new FakeElement('讲解')
  const secondExplainButton = new FakeElement('讲解')
  const firstCard = new FakeElement('1 商品 到手价 售出/库存', {
    children: [firstExplainButton],
  })
  const secondCard = new FakeElement('2 商品 到手价 售出/库存', {
    children: [secondExplainButton],
  })
  const documentRoot = new FakeRoot([
    firstCard,
    secondCard,
    firstExplainButton,
    secondExplainButton,
  ])

  const action = core.planNextAction(documentRoot, { productIndex: 2 })

  assert.equal(action.type, 'start')
  assert.equal(action.explainButton, secondExplainButton)
  assert.equal(action.cardRoot, secondCard)
})

test('falls back to product card order when card text does not include the index', () => {
  const core = loadCore()
  const firstCard = new FakeElement('商品 到手价 售出/库存')
  const secondCard = new FakeElement('商品 到手价 售出/库存')
  const firstExplainButton = new FakeElement('讲解', { parentElement: firstCard })
  const secondExplainButton = new FakeElement('讲解', { parentElement: secondCard })
  firstCard.elements = [firstExplainButton]
  secondCard.elements = [secondExplainButton]
  const documentRoot = new FakeRoot([
    firstCard,
    secondCard,
    firstExplainButton,
    secondExplainButton,
  ])

  const action = core.planNextAction(documentRoot, { productIndex: 2 })

  assert.equal(action.type, 'start')
  assert.equal(action.explainButton, secondExplainButton)
  assert.equal(action.cardRoot, secondCard)
})

test('restarts only the configured product when that product is explaining', () => {
  const core = loadCore()
  const firstCancelButton = new FakeElement('取消讲解')
  const secondCancelButton = new FakeElement('取消讲解')
  const firstCard = new FakeElement('1 商品 到手价 售出/库存', {
    children: [firstCancelButton],
  })
  const secondCard = new FakeElement('2 商品 到手价 售出/库存', {
    children: [secondCancelButton],
  })
  const documentRoot = new FakeRoot([firstCard, secondCard, firstCancelButton, secondCancelButton])

  const action = core.planNextAction(documentRoot, { productIndex: 2 })

  assert.equal(action.type, 'restart')
  assert.equal(action.cancelButton, secondCancelButton)
  assert.equal(action.cardRoot, secondCard)
})

test('reports no target when the configured product index is missing', () => {
  const core = loadCore()
  const explainButton = new FakeElement('讲解')
  const card = new FakeElement('1 商品 到手价 售出/库存', {
    children: [explainButton],
  })
  const documentRoot = new FakeRoot([card, explainButton])

  const action = core.planNextAction(documentRoot, { productIndex: 3 })

  assert.equal(action.type, 'none')
  assert.equal(action.reason, 'product-not-found')
})

test('normalizes user configurable seconds into safe millisecond values', () => {
  const core = loadCore()

  const normalized = core.normalizeSettings({
    intervalSeconds: '15',
    productIndex: '3',
    restartDelaySeconds: '2',
  })

  assert.equal(normalized.intervalSeconds, 15)
  assert.equal(normalized.productIndex, 3)
  assert.equal(normalized.restartDelaySeconds, 2)
  assert.equal(normalized.intervalMs, 15_000)
  assert.equal(normalized.restartDelayMs, 2_000)
})
