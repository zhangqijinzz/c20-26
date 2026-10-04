import { getItemBounds, normalizeRotation } from '../../shared/layoutRules'
import type { DeskItem, ItemBounds } from '../../shared/models'

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'
export type DistributeAxis = 'horizontal' | 'vertical'

export interface ItemPosition {
  id: string
  x: number
  y: number
}

export interface CanvasRect {
  left: number
  top: number
  right: number
  bottom: number
}

function updateCanvasItem(items: DeskItem[], id: string, updater: (item: DeskItem) => DeskItem): DeskItem[] {
  return items.map((item) => item.id === id ? updater(item) : item)
}

export function moveCanvasItem(items: DeskItem[], id: string, x: number, y: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, x, y }))
}

export function moveCanvasItems(items: DeskItem[], updates: ItemPosition[]): DeskItem[] {
  const positions = new Map(updates.map((update) => [update.id, update]))
  return items.map((item) => {
    const update = positions.get(item.id)
    return update ? { ...item, x: update.x, y: update.y } : item
  })
}

export function rotateCanvasItem(items: DeskItem[], id: string, delta: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, rotation: normalizeRotation(item.rotation + delta) }))
}

export function getSelectionFrame(items: DeskItem[]): ItemBounds | null {
  if (items.length === 0) return null
  const boundsList = items.map(getItemBounds)
  const left = Math.min(...boundsList.map((bounds) => bounds.left))
  const top = Math.min(...boundsList.map((bounds) => bounds.top))
  const right = Math.max(...boundsList.map((bounds) => bounds.right))
  const bottom = Math.max(...boundsList.map((bounds) => bounds.bottom))
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

export function alignCanvasItems(items: DeskItem[], ids: string[], mode: AlignMode): DeskItem[] {
  const idSet = new Set(ids)
  const selected = items.filter((item) => idSet.has(item.id))
  const frame = getSelectionFrame(selected)
  if (selected.length < 2 || !frame) return items
  return items.map((item) => {
    if (!idSet.has(item.id)) return item
    const bounds = getItemBounds(item)
    let dx = 0
    let dy = 0
    switch (mode) {
      case 'left': dx = frame.left - bounds.left; break
      case 'centerX': dx = (frame.left + frame.right) / 2 - (bounds.left + bounds.right) / 2; break
      case 'right': dx = frame.right - bounds.right; break
      case 'top': dy = frame.top - bounds.top; break
      case 'centerY': dy = (frame.top + frame.bottom) / 2 - (bounds.top + bounds.bottom) / 2; break
      case 'bottom': dy = frame.bottom - bounds.bottom; break
    }
    return { ...item, x: item.x + dx, y: item.y + dy }
  })
}

export function distributeCanvasItems(items: DeskItem[], ids: string[], axis: DistributeAxis): DeskItem[] {
  const idSet = new Set(ids)
  const entries = items
    .filter((item) => idSet.has(item.id))
    .map((item) => ({ item, bounds: getItemBounds(item) }))
  if (entries.length < 3) return items
  const centerOf = (bounds: ItemBounds) => axis === 'horizontal' ? bounds.left + bounds.right : bounds.top + bounds.bottom
  entries.sort((first, second) => centerOf(first.bounds) - centerOf(second.bounds))
  const startEdge = axis === 'horizontal' ? entries[0].bounds.left : entries[0].bounds.top
  const lastBounds = entries[entries.length - 1].bounds
  const endEdge = axis === 'horizontal' ? lastBounds.right : lastBounds.bottom
  const sizeOf = (bounds: ItemBounds) => axis === 'horizontal' ? bounds.width : bounds.height
  const totalSize = entries.reduce((sum, entry) => sum + sizeOf(entry.bounds), 0)
  const gap = (endEdge - startEdge - totalSize) / (entries.length - 1)
  const shifts = new Map<string, { dx: number; dy: number }>()
  let cursor = startEdge
  entries.forEach((entry) => {
    const currentStart = axis === 'horizontal' ? entry.bounds.left : entry.bounds.top
    const delta = cursor - currentStart
    shifts.set(entry.item.id, axis === 'horizontal' ? { dx: delta, dy: 0 } : { dx: 0, dy: delta })
    cursor += sizeOf(entry.bounds) + gap
  })
  return items.map((item) => {
    const shift = shifts.get(item.id)
    return shift ? { ...item, x: item.x + shift.dx, y: item.y + shift.dy } : item
  })
}

export function getItemIdsInRect(items: DeskItem[], rect: CanvasRect): string[] {
  return items
    .filter((item) => {
      const bounds = getItemBounds(item)
      return bounds.left < rect.right && bounds.right > rect.left && bounds.top < rect.bottom && bounds.bottom > rect.top
    })
    .map((item) => item.id)
}
