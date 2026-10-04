import { describe, expect, it } from 'vitest'
import { createItem, createPlan } from '../../../shared/models'
import { getItemBounds } from '../../../shared/layoutRules'
import { alignItems, distributeItems, findItemsInRect, normalizeDragRect } from '../arrangeItems'
import { summarizeArrangementIssues } from '../../inspection/inspectionViewModel'

function rotatedMonitor() {
  return { ...createItem('monitor'), widthMm: 400, heightMm: 200, rotation: 90, x: 100, y: 100 }
}

describe('arrange items', () => {
  it('aligns left edges using the rotated footprint, not the raw frame', () => {
    const monitor = rotatedMonitor()
    const keyboard = { ...createItem('keyboard'), widthMm: 400, heightMm: 150, x: 500, y: 600 }
    expect(Math.round(getItemBounds(monitor).left)).toBe(200)
    const aligned = alignItems([monitor, keyboard], [monitor.id, keyboard.id], 'left')
    const nextMonitor = aligned.find((item) => item.id === monitor.id)
    const nextKeyboard = aligned.find((item) => item.id === keyboard.id)
    expect(nextMonitor?.x).toBe(100)
    expect(nextKeyboard?.x).toBe(200)
    expect(getItemBounds(nextKeyboard!).left).toBeCloseTo(getItemBounds(nextMonitor!).left)
  })

  it('aligns right edges and horizontal centers across the selection', () => {
    const monitor = rotatedMonitor()
    const keyboard = { ...createItem('keyboard'), widthMm: 400, heightMm: 150, x: 500, y: 600 }
    const rightAligned = alignItems([monitor, keyboard], [monitor.id, keyboard.id], 'right')
    const movedMonitor = rightAligned.find((item) => item.id === monitor.id)!
    expect(movedMonitor.x).toBe(600)
    expect(getItemBounds(movedMonitor).right).toBeCloseTo(getItemBounds(keyboard).right)

    const centered = alignItems([monitor, keyboard], [monitor.id, keyboard.id], 'centerX')
    const centers = centered.map((item) => {
      const bounds = getItemBounds(item)
      return (bounds.left + bounds.right) / 2
    })
    expect(centers[0]).toBeCloseTo(centers[1])
    expect(centers[0]).toBeCloseTo(550)
  })

  it('aligns top, vertical center and bottom on the vertical axis', () => {
    const first = { ...createItem('lamp'), widthMm: 180, heightMm: 180, x: 100, y: 50 }
    const second = { ...createItem('speaker'), widthMm: 150, heightMm: 150, x: 400, y: 300 }
    const topAligned = alignItems([first, second], [first.id, second.id], 'top')
    expect(topAligned[1].y).toBe(50)
    const bottomAligned = alignItems([first, second], [first.id, second.id], 'bottom')
    expect(getItemBounds(bottomAligned[0]).bottom).toBeCloseTo(getItemBounds(bottomAligned[1]).bottom)
    const middleAligned = alignItems([first, second], [first.id, second.id], 'centerY')
    const firstBounds = getItemBounds(middleAligned[0])
    const secondBounds = getItemBounds(middleAligned[1])
    expect((firstBounds.top + firstBounds.bottom) / 2).toBeCloseTo((secondBounds.top + secondBounds.bottom) / 2)
  })

  it('leaves items untouched when fewer than two are selected', () => {
    const items = [rotatedMonitor()]
    expect(alignItems(items, [items[0].id], 'left')).toBe(items)
    expect(alignItems(items, [], 'left')).toBe(items)
  })

  it('distributes items horizontally with equal gaps and anchored ends', () => {
    const first = { ...createItem('speaker'), widthMm: 200, heightMm: 100, x: 0, y: 100 }
    const second = { ...createItem('lamp'), widthMm: 300, heightMm: 100, x: 250, y: 100 }
    const third = { ...createItem('stand'), widthMm: 100, heightMm: 100, x: 900, y: 100 }
    const distributed = distributeItems([third, first, second], [first.id, second.id, third.id], 'horizontal')
    const nextFirst = distributed.find((item) => item.id === first.id)!
    const nextSecond = distributed.find((item) => item.id === second.id)!
    const nextThird = distributed.find((item) => item.id === third.id)!
    expect(nextFirst.x).toBe(0)
    expect(nextThird.x).toBe(900)
    expect(nextSecond.x).toBe(400)
    const firstGap = getItemBounds(nextSecond).left - getItemBounds(nextFirst).right
    const secondGap = getItemBounds(nextThird).left - getItemBounds(nextSecond).right
    expect(firstGap).toBeCloseTo(secondGap)
  })

  it('distributes items vertically and respects rotated footprints', () => {
    const first = { ...createItem('speaker'), widthMm: 100, heightMm: 100, x: 100, y: 0 }
    const second = { ...createItem('monitor'), widthMm: 400, heightMm: 200, rotation: 90, x: 100, y: 150 }
    const third = { ...createItem('lamp'), widthMm: 100, heightMm: 100, x: 100, y: 700 }
    const distributed = distributeItems([first, second, third], [first.id, second.id, third.id], 'vertical')
    const nextFirst = distributed.find((item) => item.id === first.id)!
    const nextSecond = distributed.find((item) => item.id === second.id)!
    const nextThird = distributed.find((item) => item.id === third.id)!
    expect(nextFirst.y).toBe(0)
    expect(nextThird.y).toBe(700)
    const firstGap = getItemBounds(nextSecond).top - getItemBounds(nextFirst).bottom
    const secondGap = getItemBounds(nextThird).top - getItemBounds(nextSecond).bottom
    expect(firstGap).toBeCloseTo(secondGap)
    expect(getItemBounds(nextSecond).height).toBeCloseTo(400)
  })

  it('requires at least three items to distribute', () => {
    const items = [createItem('lamp'), createItem('speaker')]
    expect(distributeItems(items, items.map((item) => item.id), 'horizontal')).toBe(items)
  })

  it('hits rotated footprints when marquee selecting', () => {
    const monitor = rotatedMonitor()
    const keyboard = { ...createItem('keyboard'), widthMm: 400, heightMm: 150, x: 500, y: 600 }
    const rect = normalizeDragRect(600, 500, 350, 300)
    expect(rect).toEqual({ left: 350, top: 300, right: 600, bottom: 500 })
    const hits = findItemsInRect([monitor, keyboard], rect)
    expect(hits).toEqual([monitor.id])
  })
})

describe('arrangement pre-check', () => {
  it('flags moved items that would leave the desk', () => {
    const plan = createPlan('预检', false)
    const monitor = { ...createItem('monitor'), widthMm: 400, heightMm: 200, x: 100, y: 100 }
    const nextItems = [{ ...monitor, x: 1500 }]
    const summary = summarizeArrangementIssues({ ...plan, items: [monitor] }, nextItems, [monitor.id])
    expect(summary.hasIssues).toBe(true)
    expect(summary.outOfBoundsCount).toBe(1)
    expect(summary.overlapCount).toBe(0)
  })

  it('flags moved items that would overlap, without blaming bystanders', () => {
    const plan = createPlan('预检', false)
    const monitor = { ...createItem('monitor'), widthMm: 400, heightMm: 200, x: 100, y: 100 }
    const keyboard = { ...createItem('keyboard'), widthMm: 400, heightMm: 150, x: 1000, y: 100 }
    const nextItems = [monitor, { ...keyboard, x: 200, y: 120 }]
    const summary = summarizeArrangementIssues({ ...plan, items: [monitor, keyboard] }, nextItems, [keyboard.id])
    expect(summary.hasIssues).toBe(true)
    expect(summary.overlapCount).toBe(1)
    expect(summary.outOfBoundsCount).toBe(0)
  })

  it('passes when the arrangement stays clear', () => {
    const plan = createPlan('预检', false)
    const monitor = { ...createItem('monitor'), widthMm: 400, heightMm: 200, x: 100, y: 100 }
    const keyboard = { ...createItem('keyboard'), widthMm: 400, heightMm: 150, x: 1000, y: 500 }
    const summary = summarizeArrangementIssues({ ...plan, items: [monitor, keyboard] }, [monitor, keyboard], [monitor.id, keyboard.id])
    expect(summary.hasIssues).toBe(false)
  })
})
