import { describe, expect, it } from 'vitest'
import { createItem } from '../../../shared/models'
import { getItemBounds } from '../../../shared/layoutRules'
import {
  alignCanvasItems,
  distributeCanvasItems,
  getItemIdsInRect,
  moveCanvasItem,
  moveCanvasItems,
  rotateCanvasItem,
} from '../canvasViewModel'

describe('canvas module', () => {
  it('moves and rotates the requested item without changing other items', () => {
    const first = createItem('monitor')
    const second = createItem('keyboard')
    const moved = moveCanvasItem([first, second], first.id, 320, 180)
    const rotated = rotateCanvasItem(moved, first.id, -15)
    expect(rotated[0]).toMatchObject({ x: 320, y: 180, rotation: 345 })
    expect(rotated[1]).toEqual(second)
  })

  it('moves a group of items to absolute positions in one pass', () => {
    const first = createItem('monitor')
    const second = createItem('keyboard')
    const third = createItem('lamp')
    const moved = moveCanvasItems([first, second, third], [
      { id: first.id, x: 10, y: 20 },
      { id: third.id, x: 30, y: 40 },
    ])
    expect(moved[0]).toMatchObject({ x: 10, y: 20 })
    expect(moved[1]).toEqual(second)
    expect(moved[2]).toMatchObject({ x: 30, y: 40 })
  })
})

describe('multi-select arrangement', () => {
  it('aligns to the rotated footprint instead of the unrotated box', () => {
    const tall = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200, rotation: 90 }
    const wide = { ...createItem('keyboard'), x: 500, y: 300, widthMm: 400, heightMm: 200 }
    // tall 旋转 90° 后实际占位 200 × 400，left 边缘在 200 而不是 100
    const aligned = alignCanvasItems([tall, wide], [tall.id, wide.id], 'left')
    expect(Math.round(getItemBounds(aligned[0]).left)).toBe(200)
    expect(Math.round(getItemBounds(aligned[1]).left)).toBe(200)
    expect(aligned[1].x).toBe(200)
  })

  it('centers items horizontally around the selection frame', () => {
    const tall = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200, rotation: 90 }
    const wide = { ...createItem('keyboard'), x: 500, y: 300, widthMm: 400, heightMm: 200 }
    const aligned = alignCanvasItems([tall, wide], [tall.id, wide.id], 'centerX')
    const firstBounds = getItemBounds(aligned[0])
    const secondBounds = getItemBounds(aligned[1])
    expect(Math.round((firstBounds.left + firstBounds.right) / 2)).toBe(550)
    expect(Math.round((secondBounds.left + secondBounds.right) / 2)).toBe(550)
  })

  it('aligns top and bottom edges using rotated bounds', () => {
    const tall = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200, rotation: 90 }
    const wide = { ...createItem('keyboard'), x: 500, y: 300, widthMm: 400, heightMm: 200 }
    const alignedTop = alignCanvasItems([tall, wide], [tall.id, wide.id], 'top')
    expect(Math.round(getItemBounds(alignedTop[1]).top)).toBe(0)
    const alignedBottom = alignCanvasItems([tall, wide], [tall.id, wide.id], 'bottom')
    expect(Math.round(getItemBounds(alignedBottom[1]).bottom)).toBe(500)
  })

  it('distributes items with equal gaps while keeping the ends fixed', () => {
    const first = { ...createItem('speaker'), x: 0, y: 0, widthMm: 100, heightMm: 100 }
    const second = { ...createItem('speaker'), x: 230, y: 0, widthMm: 100, heightMm: 100 }
    const third = { ...createItem('speaker'), x: 1000, y: 0, widthMm: 100, heightMm: 100 }
    const distributed = distributeCanvasItems([first, second, third], [first.id, second.id, third.id], 'horizontal')
    expect(distributed[0].x).toBe(0)
    expect(Math.round(distributed[1].x)).toBe(500)
    expect(distributed[2].x).toBe(1000)
  })

  it('leaves items untouched when distribution has fewer than three members', () => {
    const first = createItem('monitor')
    const second = createItem('keyboard')
    const items = [first, second]
    expect(distributeCanvasItems(items, [first.id, second.id], 'vertical')).toEqual(items)
  })

  it('hits items intersecting a marquee rect using their rotated bounds', () => {
    const rotated = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200, rotation: 90 }
    // 旋转后占位为 left 200–400 / top 0–400
    expect(getItemIdsInRect([rotated], { left: 210, top: 10, right: 390, bottom: 390 })).toEqual([rotated.id])
    // 未旋转的框会覆盖 100–500，但旋转后的真实占位已经让出这块区域
    expect(getItemIdsInRect([rotated], { left: 100, top: 100, right: 190, bottom: 200 })).toEqual([])
  })
})
