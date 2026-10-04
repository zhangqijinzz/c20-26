import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { BoxSelect, Move } from 'lucide-react'
import type { DeskItem, LayoutAnalysis, WorkspacePlan } from '../../../shared/models'
import { getDeviceDefinition } from '../../../shared/models'
import { getItemBounds } from '../../../shared/layoutRules'
import { getItemIdsInRect, type CanvasRect, type ItemPosition } from '../canvasViewModel'

interface CanvasStageProps {
  plan: WorkspacePlan
  selectedItemIds: string[]
  analysis: LayoutAnalysis
  onSelectionChange: (ids: string[]) => void
  onMoveItems: (updates: ItemPosition[]) => void
}

type DragState =
  | { kind: 'items'; startX: number; startY: number; originals: ItemPosition[] }
  | { kind: 'marquee'; startX: number; startY: number; currentX: number; currentY: number; additive: boolean }

const MARQUEE_CLICK_TOLERANCE_MM = 8

function normalizeRect(x1: number, y1: number, x2: number, y2: number): CanvasRect {
  return { left: Math.min(x1, x2), top: Math.min(y1, y2), right: Math.max(x1, x2), bottom: Math.max(y1, y2) }
}

export function CanvasStage({ plan, selectedItemIds, analysis, onSelectionChange, onMoveItems }: CanvasStageProps) {
  const stageRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
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
      if (drag.kind === 'items') {
        const dx = point.x - drag.startX
        const dy = point.y - drag.startY
        onMoveItems(drag.originals.map((origin) => ({ id: origin.id, x: origin.x + dx, y: origin.y + dy })))
      } else {
        setDrag({ ...drag, currentX: point.x, currentY: point.y })
      }
    }
    const handleUp = (event: PointerEvent) => {
      if (drag.kind === 'marquee') {
        const point = scaleToMm(event.clientX, event.clientY)
        const rect = normalizeRect(drag.startX, drag.startY, point?.x ?? drag.currentX, point?.y ?? drag.currentY)
        const isClick = rect.right - rect.left < MARQUEE_CLICK_TOLERANCE_MM && rect.bottom - rect.top < MARQUEE_CLICK_TOLERANCE_MM
        if (isClick) {
          if (!drag.additive) onSelectionChange([])
        } else {
          const hitIds = getItemIdsInRect(plan.items, rect)
          onSelectionChange(drag.additive ? [...selectedItemIds, ...hitIds] : hitIds)
        }
      }
      setDrag(null)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => { window.removeEventListener('pointermove', handleMove); window.removeEventListener('pointerup', handleUp) }
  }, [drag, onMoveItems, onSelectionChange, plan.items, scaleToMm, selectedItemIds])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.activeElement instanceof HTMLInputElement) return
      onSelectionChange([])
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onSelectionChange])

  const startItemDrag = (event: ReactPointerEvent<SVGGElement>, item: DeskItem) => {
    event.stopPropagation()
    const point = scaleToMm(event.clientX, event.clientY)
    if (!point) return
    if (event.shiftKey) {
      onSelectionChange(selectedItemIds.includes(item.id) ? selectedItemIds.filter((id) => id !== item.id) : [...selectedItemIds, item.id])
      return
    }
    const ids = selectedItemIds.includes(item.id) ? selectedItemIds : [item.id]
    if (!selectedItemIds.includes(item.id)) onSelectionChange([item.id])
    const originals = plan.items
      .filter((candidate) => ids.includes(candidate.id))
      .map((candidate) => ({ id: candidate.id, x: candidate.x, y: candidate.y }))
    setDrag({ kind: 'items', startX: point.x, startY: point.y, originals })
  }

  const startMarquee = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = scaleToMm(event.clientX, event.clientY)
    if (!point) return
    setDrag({ kind: 'marquee', startX: point.x, startY: point.y, currentX: point.x, currentY: point.y, additive: event.shiftKey })
  }

  const marqueeRect = drag?.kind === 'marquee' ? normalizeRect(drag.startX, drag.startY, drag.currentX, drag.currentY) : null

  return (
    <div className="canvas-wrap">
      <div className="canvas-toolbar">
        <span><Move size={14} /> {selectedItemIds.length > 1 ? `已选 ${selectedItemIds.length} 件，拖动任一可整体平移` : '拖动设备调整位置 · Shift 点击追加选择'}</span>
        <span><BoxSelect size={14} /> 空白处拖拽框选 · 旋转请在右侧操作</span>
      </div>
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
          return <g className={`desk-item ${isSelected ? 'is-selected' : ''} ${hasIssue ? 'has-issue' : ''}`} key={item.id} onPointerDown={(event) => startItemDrag(event, item)} role="button" tabIndex={0} aria-label={`${definition.label}，${item.widthMm}乘${item.heightMm}毫米`}>
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
        {marqueeRect && <rect className="marquee-rect" x={marqueeRect.left} y={marqueeRect.top} width={marqueeRect.right - marqueeRect.left} height={marqueeRect.bottom - marqueeRect.top} rx="10" />}
      </svg>
      <div className="canvas-legend"><span><i className="legend-dot clear-dot" /> 可用空间</span><span><i className="legend-dot issue-dot" /> 冲突 / 越界</span><span className="canvas-scale">网格：50 mm</span></div>
    </div>
  )
}
