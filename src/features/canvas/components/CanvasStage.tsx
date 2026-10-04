import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { BoxSelect, Move } from 'lucide-react'
import type { DeskItem, LayoutAnalysis, WorkspacePlan } from '../../../shared/models'
import { getDeviceDefinition } from '../../../shared/models'
import { getItemBounds } from '../../../shared/layoutRules'
import { findItemsInRect, normalizeDragRect, type DragRect } from '../arrangeItems'

interface CanvasStageProps {
  plan: WorkspacePlan
  selectedItemIds: string[]
  analysis: LayoutAnalysis
  onSelect: (id: string | null) => void
  onToggleSelect: (id: string) => void
  onMarqueeSelect: (ids: string[], additive: boolean) => void
  onMoveItems: (updates: Array<{ id: string; x: number; y: number }>) => void
}

interface DragState {
  pointerStartX: number
  pointerStartY: number
  startPositions: Array<{ id: string; x: number; y: number }>
}

interface MarqueeStart { x: number; y: number; additive: boolean }

const CLICK_SLOP_MM = 10

function isAdditiveGesture(event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): boolean {
  return event.shiftKey || event.ctrlKey || event.metaKey
}

export function CanvasStage({ plan, selectedItemIds, analysis, onSelect, onToggleSelect, onMarqueeSelect, onMoveItems }: CanvasStageProps) {
  const stageRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [marqueeActive, setMarqueeActive] = useState(false)
  const [marqueeRect, setMarqueeRect] = useState<DragRect | null>(null)
  const marqueeStartRef = useRef<MarqueeStart | null>(null)
  const scaleToMm = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { x: ((clientX - rect.left) / rect.width) * plan.deskWidthMm, y: ((clientY - rect.top) / rect.height) * plan.deskHeightMm }
  }, [plan.deskHeightMm, plan.deskWidthMm])

  useEffect(() => {
    if (!drag) return
    const handleMove = (event: PointerEvent) => {
      const point = scaleToMm(event.clientX, event.clientY)
      if (!point) return
      const deltaX = point.x - drag.pointerStartX
      const deltaY = point.y - drag.pointerStartY
      onMoveItems(drag.startPositions.map((start) => ({ id: start.id, x: start.x + deltaX, y: start.y + deltaY })))
    }
    const handleUp = () => setDrag(null)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => { window.removeEventListener('pointermove', handleMove); window.removeEventListener('pointerup', handleUp) }
  }, [drag, onMoveItems, scaleToMm])

  useEffect(() => {
    if (!marqueeActive) return
    const handleMove = (event: PointerEvent) => {
      const start = marqueeStartRef.current
      const point = scaleToMm(event.clientX, event.clientY)
      if (!start || !point) return
      setMarqueeRect(normalizeDragRect(start.x, start.y, point.x, point.y))
    }
    const handleUp = (event: PointerEvent) => {
      const start = marqueeStartRef.current
      marqueeStartRef.current = null
      setMarqueeActive(false)
      setMarqueeRect(null)
      if (!start) return
      const point = scaleToMm(event.clientX, event.clientY)
      if (!point) {
        if (!start.additive) onSelect(null)
        return
      }
      const rect = normalizeDragRect(start.x, start.y, point.x, point.y)
      const isClick = rect.right - rect.left < CLICK_SLOP_MM && rect.bottom - rect.top < CLICK_SLOP_MM
      if (isClick) {
        if (!start.additive) onSelect(null)
        return
      }
      onMarqueeSelect(findItemsInRect(plan.items, rect), start.additive)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => { window.removeEventListener('pointermove', handleMove); window.removeEventListener('pointerup', handleUp) }
  }, [marqueeActive, onMarqueeSelect, onSelect, plan.items, scaleToMm])

  useEffect(() => {
    if (selectedItemIds.length === 0) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      onSelect(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedItemIds.length, onSelect])

  const startDrag = (event: ReactPointerEvent<SVGGElement>, item: DeskItem) => {
    event.stopPropagation()
    if (isAdditiveGesture(event)) {
      onToggleSelect(item.id)
      return
    }
    const point = scaleToMm(event.clientX, event.clientY)
    if (!point) return
    const alreadySelected = selectedItemIds.includes(item.id)
    const dragIds = alreadySelected ? selectedItemIds : [item.id]
    if (!alreadySelected) onSelect(item.id)
    setDrag({
      pointerStartX: point.x,
      pointerStartY: point.y,
      startPositions: plan.items
        .filter((candidate) => dragIds.includes(candidate.id))
        .map((candidate) => ({ id: candidate.id, x: candidate.x, y: candidate.y })),
    })
  }

  const startMarquee = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = scaleToMm(event.clientX, event.clientY)
    if (!point) return
    marqueeStartRef.current = { x: point.x, y: point.y, additive: isAdditiveGesture(event) }
    setMarqueeRect({ left: point.x, top: point.y, right: point.x, bottom: point.y })
    setMarqueeActive(true)
  }

  return (
    <div className="canvas-wrap">
      <div className="canvas-toolbar"><span><Move size={14} /> 拖动设备整体平移</span><span><BoxSelect size={14} /> 空白处拖动框选 · Shift 点击追加</span></div>
      <svg ref={stageRef} className="desk-canvas" viewBox={`0 0 ${plan.deskWidthMm} ${plan.deskHeightMm}`} role="img" aria-label={`桌面布局画布，${plan.deskWidthMm}乘${plan.deskHeightMm}毫米`} onPointerDown={startMarquee}>
        <defs>
          <pattern id="desk-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#d8e1ed" strokeWidth="1" /></pattern>
          <filter id="item-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#20304a" floodOpacity=".12" /></filter>
        </defs>
        <rect width={plan.deskWidthMm} height={plan.deskHeightMm} rx="22" fill="#f8fafc" />
        <rect width={plan.deskWidthMm} height={plan.deskHeightMm} rx="22" fill="url(#desk-grid)" />
        <text x="34" y="48" fill="#a0aec0" fontSize="20" letterSpacing="3">FOCUS ZONE / {plan.deskWidthMm} × {plan.deskHeightMm} MM</text>
        {plan.items.map((item) => {
          const definition = getDeviceDefinition(item.type)
          const isSelected = selectedItemIds.includes(item.id)
          const hasIssue = analysis.overlapIds.includes(item.id) || analysis.outOfBoundsIds.includes(item.id)
          const cx = item.x + item.widthMm / 2
          const cy = item.y + item.heightMm / 2
          return <g className={`desk-item ${isSelected ? 'is-selected' : ''} ${hasIssue ? 'has-issue' : ''}`} key={item.id} onPointerDown={(event) => startDrag(event, item)} role="button" tabIndex={0} aria-label={`${definition.label}，${item.widthMm}乘${item.heightMm}毫米`}>
            <g transform={`translate(${cx} ${cy}) rotate(${item.rotation})`}>
              <rect x={-item.widthMm / 2} y={-item.heightMm / 2} width={item.widthMm} height={item.heightMm} rx={Math.min(24, item.heightMm / 5)} fill={definition.color} filter="url(#item-shadow)" />
              <rect className="item-inner-line" x={-item.widthMm / 2 + 12} y={-item.heightMm / 2 + 12} width={Math.max(0, item.widthMm - 24)} height={Math.max(0, item.heightMm - 24)} rx={12} fill="none" />
              <text x="0" y="5" textAnchor="middle" fill="#1f2e44" fontWeight="700" fontSize={Math.max(18, Math.min(32, item.widthMm / 16))}>{definition.shortLabel}</text>
              <text x="0" y="30" textAnchor="middle" fill="#44546b" fontSize="16">{item.widthMm} × {item.heightMm}</text>
            </g>
            {isSelected && <rect className="selection-box" x={getItemBounds(item).left - 8} y={getItemBounds(item).top - 8} width={getItemBounds(item).width + 16} height={getItemBounds(item).height + 16} rx="12" fill="none" />}
            {hasIssue && <g transform={`translate(${Math.max(18, getItemBounds(item).right - 4)} ${Math.max(18, getItemBounds(item).top - 4)}`}><circle r="18" fill="#ef6a6a" /><text textAnchor="middle" y="7" fill="white" fontSize="22" fontWeight="700">!</text></g>}
          </g>
        })}
        {plan.items.length === 0 && <g><circle cx={plan.deskWidthMm / 2} cy={plan.deskHeightMm / 2 - 12} r="32" fill="#e8eef6" /><text x={plan.deskWidthMm / 2} y={plan.deskHeightMm / 2 + 2} textAnchor="middle" fill="#8493a8" fontSize="22">+</text><text x={plan.deskWidthMm / 2} y={plan.deskHeightMm / 2 + 48} textAnchor="middle" fill="#8493a8" fontSize="22">从左侧添加第一件设备</text></g>}
        {marqueeRect && <rect className="marquee-box" x={marqueeRect.left} y={marqueeRect.top} width={marqueeRect.right - marqueeRect.left} height={marqueeRect.bottom - marqueeRect.top} rx="10" />}
      </svg>
      <div className="canvas-legend"><span><i className="legend-dot clear-dot" /> 可用空间</span><span><i className="legend-dot issue-dot" /> 冲突 / 越界</span><span className="canvas-scale">网格：50 mm</span></div>
    </div>
  )
}
