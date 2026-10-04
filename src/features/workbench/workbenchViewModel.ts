import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createId,
  createInitialDocument,
  createPlan,
  type DeskItem,
  type DeviceType,
  type LayoutAnalysis,
  type WorkspaceDocument,
  type WorkspacePlan,
  type WorkspaceStatus,
} from '../../shared/models'
import { clampDeskSize, clampItemDimension } from '../../shared/layoutRules'
import {
  alignCanvasItems,
  distributeCanvasItems,
  moveCanvasItems,
  rotateCanvasItem,
  type AlignMode,
  type DistributeAxis,
  type ItemPosition,
} from '../canvas/canvasViewModel'
import { createMaterialDraft } from '../materials/materialsViewModel'
import { inspectPlan, previewArrangementIssues, type ArrangementIssuePreview } from '../inspection/inspectionViewModel'
import { LocalWorkspaceRepository, type WorkspaceRepository } from './workspaceRepository'

export interface WorkspaceViewModel {
  status: WorkspaceStatus
  document: WorkspaceDocument | null
  activePlan: WorkspacePlan | null
  selectedItemIds: string[]
  selectedItems: DeskItem[]
  selectedItem: DeskItem | null
  analysis: LayoutAnalysis
  issueIds: string[]
  issueCount: number
  feedback: string
  isPreviewOpen: boolean
  selectItems: (ids: string[]) => void
  addItem: (type: DeviceType) => void
  removeItem: (id: string) => void
  moveItems: (updates: ItemPosition[]) => void
  rotateItem: (id: string, delta: number) => void
  updateItem: (id: string, patch: Partial<Pick<DeskItem, 'widthMm' | 'heightMm' | 'x' | 'y'>>) => void
  updateDesk: (field: 'deskWidthMm' | 'deskHeightMm', value: number) => void
  alignSelection: (mode: AlignMode) => void
  distributeSelection: (axis: DistributeAxis) => void
  createNewPlan: () => void
  duplicatePlan: () => void
  selectPlan: (id: string) => void
  deleteCurrentPlan: () => void
  openPreview: () => void
  closePreview: () => void
}

const emptyInspection = { analysis: { overlapIds: [], outOfBoundsIds: [], coveragePercent: 0, status: 'clear' as const }, issueIds: [], issueCount: 0 }

const ALIGN_LABELS: Record<AlignMode, string> = {
  left: '左对齐',
  centerX: '水平居中',
  right: '右对齐',
  top: '顶对齐',
  centerY: '垂直居中',
  bottom: '底对齐',
}

const DISTRIBUTE_LABELS: Record<DistributeAxis, string> = {
  horizontal: '水平等距分布',
  vertical: '垂直等距分布',
}

function describePreview(preview: ArrangementIssuePreview): string {
  const parts: string[] = []
  if (preview.outOfBoundsIds.length > 0) parts.push(`${preview.outOfBoundsIds.length} 件设备会被顶出桌面`)
  if (preview.overlapIds.length > 0) parts.push(`${preview.overlapIds.length} 件设备会被压住`)
  return parts.join('、')
}

export function useWorkspaceViewModel(repository?: WorkspaceRepository): WorkspaceViewModel {
  const repositoryRef = useRef(repository ?? new LocalWorkspaceRepository())
  const [status, setStatus] = useState<WorkspaceStatus>('loading')
  const [document, setDocument] = useState<WorkspaceDocument | null>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [feedback, setFeedback] = useState('正在准备你的工作台…')

  useEffect(() => {
    let active = true
    void repositoryRef.current.load().then((loaded) => {
      if (!active) return
      const nextDocument = loaded ?? createInitialDocument()
      setDocument(nextDocument)
      setStatus('ready')
      setFeedback(loaded ? '已恢复上次编辑状态' : '已创建示例工作台，可以直接拖动设备')
    }).catch(() => {
      if (!active) return
      setDocument(createInitialDocument())
      setStatus('error')
      setFeedback('本地数据读取失败，当前使用临时工作台')
    })
    return () => { active = false }
  }, [])

  const activePlan = useMemo(
    () => document?.plans.find((plan) => plan.id === document.activePlanId) ?? null,
    [document],
  )
  const selectedItems = useMemo(
    () => activePlan?.items.filter((item) => selectedItemIds.includes(item.id)) ?? [],
    [activePlan, selectedItemIds],
  )
  const selectedItem = selectedItems.length === 1 ? selectedItems[0] : null
  const inspection = useMemo(() => activePlan ? inspectPlan(activePlan) : emptyInspection, [activePlan])
  const { analysis, issueIds, issueCount } = inspection

  const persist = useCallback(async (nextDocument: WorkspaceDocument, message: string) => {
    setDocument(nextDocument)
    setStatus('saving')
    setFeedback(message)
    try {
      await repositoryRef.current.save(nextDocument)
      setStatus('ready')
    } catch {
      setStatus('error')
      setFeedback('自动保存失败，请检查浏览器本地存储权限')
    }
  }, [])

  const updateActivePlan = useCallback((updater: (plan: WorkspacePlan) => WorkspacePlan, message: string) => {
    if (!document || !activePlan) return
    const nextPlan = { ...updater(activePlan), updatedAt: new Date().toISOString() }
    const nextDocument = { ...document, plans: document.plans.map((plan) => plan.id === nextPlan.id ? nextPlan : plan) }
    void persist(nextDocument, message)
  }, [activePlan, document, persist])

  const selectItems = useCallback((ids: string[]) => {
    setSelectedItemIds([...new Set(ids)])
  }, [])

  const addItem = useCallback((type: DeviceType) => {
    if (!activePlan) return
    const draft = createMaterialDraft(type, activePlan.items.length)
    updateActivePlan((plan) => ({ ...plan, items: [...plan.items, draft.item] }), draft.feedback)
    setSelectedItemIds([draft.item.id])
  }, [activePlan, updateActivePlan])

  const removeItem = useCallback((id: string) => {
    updateActivePlan((plan) => ({ ...plan, items: plan.items.filter((item) => item.id !== id) }), '设备已移除')
    setSelectedItemIds((current) => current.filter((itemId) => itemId !== id))
  }, [updateActivePlan])

  const moveItems = useCallback((updates: ItemPosition[]) => {
    updateActivePlan((plan) => ({ ...plan, items: moveCanvasItems(plan.items, updates) }), '位置已更新')
  }, [updateActivePlan])

  const rotateItem = useCallback((id: string, delta: number) => {
    updateActivePlan((plan) => ({ ...plan, items: rotateCanvasItem(plan.items, id, delta) }), '角度已更新')
  }, [updateActivePlan])

  const updateItem = useCallback((id: string, patch: Partial<Pick<DeskItem, 'widthMm' | 'heightMm' | 'x' | 'y'>>) => {
    updateActivePlan((plan) => ({
      ...plan,
      items: plan.items.map((item) => item.id === id ? {
        ...item,
        ...patch,
        widthMm: patch.widthMm === undefined ? item.widthMm : clampItemDimension(patch.widthMm, item.widthMm),
        heightMm: patch.heightMm === undefined ? item.heightMm : clampItemDimension(patch.heightMm, item.heightMm),
      } : item),
    }), '尺寸参数已更新')
  }, [updateActivePlan])

  const updateDesk = useCallback((field: 'deskWidthMm' | 'deskHeightMm', value: number) => {
    if (!activePlan) return
    updateActivePlan((plan) => ({ ...plan, [field]: clampDeskSize(value, plan[field]) }), '桌面尺寸已更新')
  }, [activePlan, updateActivePlan])

  const alignSelection = useCallback((mode: AlignMode) => {
    if (!activePlan || selectedItemIds.length < 2) return
    const nextItems = alignCanvasItems(activePlan.items, selectedItemIds, mode)
    const preview = previewArrangementIssues(activePlan, nextItems)
    if (preview.issueCount > 0) {
      setFeedback(`${ALIGN_LABELS[mode]}后${describePreview(preview)}，已保留当前位置`)
      return
    }
    updateActivePlan((plan) => ({ ...plan, items: nextItems }), `已按${ALIGN_LABELS[mode]}对齐 ${selectedItemIds.length} 件设备`)
  }, [activePlan, selectedItemIds, updateActivePlan])

  const distributeSelection = useCallback((axis: DistributeAxis) => {
    if (!activePlan) return
    if (selectedItemIds.length < 3) {
      setFeedback('等距分布至少需要选中 3 件设备')
      return
    }
    const nextItems = distributeCanvasItems(activePlan.items, selectedItemIds, axis)
    const preview = previewArrangementIssues(activePlan, nextItems)
    if (preview.issueCount > 0) {
      setFeedback(`${DISTRIBUTE_LABELS[axis]}后${describePreview(preview)}，已保留当前位置`)
      return
    }
    updateActivePlan((plan) => ({ ...plan, items: nextItems }), `已${DISTRIBUTE_LABELS[axis]} ${selectedItemIds.length} 件设备`)
  }, [activePlan, selectedItemIds, updateActivePlan])

  const createNewPlan = useCallback(() => {
    if (!document) return
    const plan = createPlan(`工作台 ${document.plans.length + 1}`, false)
    void persist({ ...document, plans: [...document.plans, plan], activePlanId: plan.id }, '已创建空白方案')
    setSelectedItemIds([])
  }, [document, persist])

  const duplicatePlan = useCallback(() => {
    if (!document || !activePlan) return
    const copy: WorkspacePlan = {
      ...activePlan,
      id: createId('plan'),
      name: `${activePlan.name} · 副本`,
      items: activePlan.items.map((item) => ({ ...item, id: createId('item') })),
      updatedAt: new Date().toISOString(),
    }
    void persist({ ...document, plans: [...document.plans, copy], activePlanId: copy.id }, '方案已复制')
    setSelectedItemIds([])
  }, [activePlan, document, persist])

  const selectPlan = useCallback((id: string) => {
    if (!document || !document.plans.some((plan) => plan.id === id)) return
    void persist({ ...document, activePlanId: id }, '已切换方案')
    setSelectedItemIds([])
  }, [document, persist])

  const deleteCurrentPlan = useCallback(() => {
    if (!document || !activePlan || document.plans.length <= 1) {
      setFeedback('至少保留一个工作台方案')
      return
    }
    const remaining = document.plans.filter((plan) => plan.id !== activePlan.id)
    void persist({ ...document, plans: remaining, activePlanId: remaining[0].id }, '方案已删除')
    setSelectedItemIds([])
  }, [activePlan, document, persist])

  const openPreview = useCallback(() => setIsPreviewOpen(true), [])
  const closePreview = useCallback(() => setIsPreviewOpen(false), [])

  return {
    status,
    document,
    activePlan,
    selectedItemIds,
    selectedItems,
    selectedItem,
    analysis,
    issueIds,
    issueCount,
    feedback,
    isPreviewOpen,
    selectItems,
    addItem,
    removeItem,
    moveItems,
    rotateItem,
    updateItem,
    updateDesk,
    alignSelection,
    distributeSelection,
    createNewPlan,
    duplicatePlan,
    selectPlan,
    deleteCurrentPlan,
    openPreview,
    closePreview,
  }
}
