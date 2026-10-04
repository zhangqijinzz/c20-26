import { getItemBounds } from '../../shared/layoutRules'
import type { DeskItem } from '../../shared/models'

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'
export type DistributeAxis = 'horizontal' | 'vertical'

export interface DragRect {
  left: number
  top: number
  right: number
  bottom: number
}

export const ALIGN_LABELS: Record<AlignMode, string> = {
  left: '左对齐',
  centerX: '水平居中',
  right: '右对齐',
  top: '顶对齐',
  centerY: '垂直居中',
  bottom: '底对齐',
}

export const DISTRIBUTE_LABELS: Record<DistributeAxis, string> = {
  horizontal: '水平等距分布',
  vertical: '垂直等距分布',
}

export function normalizeDragRect(startX: number, startY: number, endX: number, endY: number): DragRect {
  return {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    right: Math.max(startX, endX),
    bottom: Math.max(startY, endY),
  }
}

export function findItemsInRect(items: DeskItem[], rect: DragRect): string[] {
  return items
    .filter((item) => {
      const bounds = getItemBounds(item)
      return bounds.left < rect.right && bounds.right > rect.left && bounds.top < rect.bottom && bounds.bottom > rect.top
    })
    .map((item) => item.id)
}

export function alignItems(items: DeskItem[], ids: string[], mode: AlignMode): DeskItem[] {
  const selectedIds = new Set(ids)
  const selected = items.filter((item) => selectedIds.has(item.id))
  if (selected.length < 2) return items
  const boundsList = selected.map((item) => getItemBounds(item))
  const boundsById = new Map(selected.map((item, index) => [item.id, boundsList[index]]))
  const minLeft = Math.min(...boundsList.map((bounds) => bounds.left))
  const maxRight = Math.max(...boundsList.map((bounds) => bounds.right))
  const minTop = Math.min(...boundsList.map((bounds) => bounds.top))
  const maxBottom = Math.max(...boundsList.map((bounds) => bounds.bottom))
  const selectionCenterX = (minLeft + maxRight) / 2
  const selectionCenterY = (minTop + maxBottom) / 2

  return items.map((item) => {
    const bounds = boundsById.get(item.id)
    if (!bounds) return item
    const itemCenterX = (bounds.left + bounds.right) / 2
    const itemCenterY = (bounds.top + bounds.bottom) / 2
    const deltaX = mode === 'left' ? minLeft - bounds.left
      : mode === 'centerX' ? selectionCenterX - itemCenterX
      : mode === 'right' ? maxRight - bounds.right
      : 0
    const deltaY = mode === 'top' ? minTop - bounds.top
      : mode === 'centerY' ? selectionCenterY - itemCenterY
      : mode === 'bottom' ? maxBottom - bounds.bottom
      : 0
    return { ...item, x: item.x + deltaX, y: item.y + deltaY }
  })
}

export function distributeItems(items: DeskItem[], ids: string[], axis: DistributeAxis): DeskItem[] {
  const selectedIds = new Set(ids)
  const selected = items.filter((item) => selectedIds.has(item.id))
  if (selected.length < 3) return items
  const horizontal = axis === 'horizontal'
  const entries = selected
    .map((item) => ({ item, bounds: getItemBounds(item) }))
    .sort((first, second) => horizontal
      ? (first.bounds.left + first.bounds.right) / 2 - (second.bounds.left + second.bounds.right) / 2
      : (first.bounds.top + first.bounds.bottom) / 2 - (second.bounds.top + second.bounds.bottom) / 2)
  const first = entries[0]
  const last = entries[entries.length - 1]
  const spanStart = horizontal ? first.bounds.left : first.bounds.top
  const spanEnd = horizontal ? last.bounds.right : last.bounds.bottom
  const totalSize = entries.reduce((total, entry) => total + (horizontal ? entry.bounds.width : entry.bounds.height), 0)
  const gap = (spanEnd - spanStart - totalSize) / (entries.length - 1)
  const offsetById = new Map<string, number>()
  let cursor = spanStart
  entries.forEach((entry) => {
    const position = horizontal ? entry.bounds.left : entry.bounds.top
    const size = horizontal ? entry.bounds.width : entry.bounds.height
    offsetById.set(entry.item.id, cursor - position)
    cursor += size + gap
  })
  return items.map((item) => {
    const offset = offsetById.get(item.id)
    if (offset === undefined) return item
    return horizontal ? { ...item, x: item.x + offset } : { ...item, y: item.y + offset }
  })
}
