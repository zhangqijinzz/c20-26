import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  AlertTriangle,
  Crosshair,
  Layers,
  RotateCcw,
  RotateCw,
  Ruler,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import type { DeskItem, WorkspacePlan } from '../../../shared/models'
import { DEVICE_DEFINITIONS, getDeviceDefinition } from '../../../shared/models'
import type { AlignMode, DistributeAxis } from '../../canvas/canvasViewModel'

interface InspectorPanelProps {
  plan: WorkspacePlan
  items: DeskItem[]
  issueIds: string[]
  onUpdateDesk: (field: 'deskWidthMm' | 'deskHeightMm', value: number) => void
  onUpdateItem: (id: string, patch: Partial<Pick<DeskItem, 'widthMm' | 'heightMm' | 'x' | 'y'>>) => void
  onRotate: (id: string, delta: number) => void
  onDelete: (id: string) => void
  onAlign: (mode: AlignMode) => void
  onDistribute: (axis: DistributeAxis) => void
}

const ALIGN_ACTIONS: { mode: AlignMode; label: string; icon: LucideIcon }[] = [
  { mode: 'left', label: '左对齐', icon: AlignStartVertical },
  { mode: 'centerX', label: '水平居中', icon: AlignCenterVertical },
  { mode: 'right', label: '右对齐', icon: AlignEndVertical },
  { mode: 'top', label: '顶对齐', icon: AlignStartHorizontal },
  { mode: 'centerY', label: '垂直居中', icon: AlignCenterHorizontal },
  { mode: 'bottom', label: '底对齐', icon: AlignEndHorizontal },
]

const DISTRIBUTE_ACTIONS: { axis: DistributeAxis; label: string; icon: LucideIcon }[] = [
  { axis: 'horizontal', label: '水平等距', icon: AlignHorizontalDistributeCenter },
  { axis: 'vertical', label: '垂直等距', icon: AlignVerticalDistributeCenter },
]

function NumericField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="numeric-field"><span>{label}</span><input type="number" value={value} min={40} onChange={(event) => onChange(event.currentTarget.valueAsNumber)} /><em>mm</em></label>
}

function summarizeTypes(items: DeskItem[]): string {
  return DEVICE_DEFINITIONS
    .map((definition) => ({ definition, count: items.filter((item) => item.type === definition.type).length }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.definition.label} × ${entry.count}`)
    .join('、')
}

function MultiItemEditor({ items, issueIds, onAlign, onDistribute }: { items: DeskItem[]; issueIds: string[]; onAlign: (mode: AlignMode) => void; onDistribute: (axis: DistributeAxis) => void }) {
  const issueCount = items.filter((item) => issueIds.includes(item.id)).length
  return (
    <div className="item-editor multi-editor">
      <div className="selected-item-heading">
        <span className="selected-swatch multi-swatch"><Layers size={14} /></span>
        <div><strong>已选中 {items.length} 件设备</strong><small>{summarizeTypes(items)}</small></div>
        <span className="item-code">MULTI</span>
      </div>
      {issueCount > 0 && <div className="issue-callout"><AlertTriangle size={16} /><span>选中的设备中有 {issueCount} 件与其他元素重叠或超出桌面边界</span></div>}
      <div className="field-heading"><span>对齐</span><span className="unit-label">按旋转后的实际占位</span></div>
      <div className="align-grid">
        {ALIGN_ACTIONS.map(({ mode, label, icon: Icon }) => (
          <button key={mode} type="button" title={label} aria-label={label} onClick={() => onAlign(mode)}><Icon size={15} /></button>
        ))}
      </div>
      <div className="field-heading distribute-heading"><span>等距分布</span><span className="unit-label">至少 3 件</span></div>
      <div className="distribute-row">
        {DISTRIBUTE_ACTIONS.map(({ axis, label, icon: Icon }) => (
          <button key={axis} type="button" disabled={items.length < 3} title={items.length < 3 ? '等距分布至少需要 3 件设备' : label} aria-label={label} onClick={() => onDistribute(axis)}><Icon size={15} /> {label}</button>
        ))}
      </div>
      <p className="helper-text multi-tip">在画布上拖动任一选中设备即可整体平移；尺寸、旋转等单件编辑请缩小到单个选择。</p>
    </div>
  )
}

export function InspectorPanel({ plan, items, issueIds, onUpdateDesk, onUpdateItem, onRotate, onDelete, onAlign, onDistribute }: InspectorPanelProps) {
  const item = items.length === 1 ? items[0] : null
  const isIssue = item ? issueIds.includes(item.id) : false
  const definition = item ? getDeviceDefinition(item.type) : null
  return (
    <aside className="inspector-panel">
      <div className="module-heading">
        <div><span className="eyebrow">02 / 检查</span><h2>尺寸检查</h2></div>
        <Ruler size={18} className="muted-icon" />
      </div>
      <div className="desk-size-card">
        <div className="field-heading"><span>桌面画布</span><span className="field-status">实时</span></div>
        <div className="desk-size-fields">
          <NumericField label="宽度" value={plan.deskWidthMm} onChange={(value) => onUpdateDesk('deskWidthMm', value)} />
          <NumericField label="深度" value={plan.deskHeightMm} onChange={(value) => onUpdateDesk('deskHeightMm', value)} />
        </div>
        <p className="helper-text">建议保留 40 mm 走线缓冲空间</p>
      </div>
      {items.length > 1 ? (
        <MultiItemEditor items={items} issueIds={issueIds} onAlign={onAlign} onDistribute={onDistribute} />
      ) : item && definition ? (
        <div className="item-editor">
          <div className="selected-item-heading"><span className="selected-swatch" style={{ backgroundColor: definition.color }} /> <div><strong>{definition.label}</strong><small>{definition.hint}</small></div><span className="item-code">{definition.shortLabel}</span></div>
          {isIssue && <div className="issue-callout"><AlertTriangle size={16} /><span>设备与其他元素重叠或超出桌面边界</span></div>}
          <div className="field-heading"><span>实际尺寸</span><span className="unit-label">单位：毫米</span></div>
          <div className="two-column-fields">
            <NumericField label="宽度" value={item.widthMm} onChange={(value) => onUpdateItem(item.id, { widthMm: value })} />
            <NumericField label="深度" value={item.heightMm} onChange={(value) => onUpdateItem(item.id, { heightMm: value })} />
          </div>
          <div className="field-heading position-heading"><span>位置</span><span className="unit-label">左上角坐标</span></div>
          <div className="two-column-fields">
            <NumericField label="X" value={Math.round(item.x)} onChange={(value) => onUpdateItem(item.id, { x: value })} />
            <NumericField label="Y" value={Math.round(item.y)} onChange={(value) => onUpdateItem(item.id, { y: value })} />
          </div>
          <div className="rotation-row"><span><Crosshair size={15} /> 旋转角度 <strong>{Math.round(item.rotation)}°</strong></span><div className="rotation-actions"><button aria-label="逆时针旋转 15 度" onClick={() => onRotate(item.id, -15)} type="button"><RotateCcw size={15} /></button><button aria-label="顺时针旋转 15 度" onClick={() => onRotate(item.id, 15)} type="button"><RotateCw size={15} /></button></div></div>
          <button className="remove-item-button" onClick={() => onDelete(item.id)} type="button"><Trash2 size={15} /> 移除这个设备</button>
        </div>
      ) : (
        <div className="empty-inspector"><span className="empty-illustration">⌖</span><strong>选择一个设备</strong><p>点击画布上的设备查看尺寸、位置和旋转控制；拖拽空白处可框选多件设备。</p></div>
      )}
    </aside>
  )
}
