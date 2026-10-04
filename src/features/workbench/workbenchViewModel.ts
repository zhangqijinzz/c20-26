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
import { moveCanvasItem, rotateCanvasItem } from '../canvas/canvasViewModel'
import {
  ALIGN_LABELS,
  DISTRIBUTE_LABELS,
  alignItems,
  distributeItems,
  type AlignMode,
  type DistributeAxis,
} from '../canvas/arrangeItems'
import { createMaterialDraft } from '../materials/materialsViewModel'
import { inspectPlan, summarizeArrangementIssues } from '../inspection/inspectionViewModel'
import { LocalWorkspaceRepository, type WorkspaceRepository } from './workspaceRepository'

export interface WorkspaceViewModel {
  status: WorkspaceStatus
  document: WorkspaceDocument | null
  activePlan: WorkspacePlan | null
  selectedItem: DeskItem | null
  selectedItemIds: string[]
  selectedItems: DeskItem[]
  analysis: LayoutAnalysis
  issueIds: string[]
  issueCount: number
  feedback: string
  isPreviewOpen: boolean
  selectItem: (id: string | null) => void
  toggleSelectItem: (id: string) => void
  selectItems: (ids: string[], additive: boolean) => void
  addItem: (type: DeviceType) => void
  removeItem: (id: string) => void
  removeItems: (ids: string[]) => void
  moveItem: (id: string, x: number, y: number) => void
  moveItems: (updates: Array<{ id: string; x: number; y: number }>) => void
  rotateItem: (id: string, delta: number) => void
  updateItem: (id: string, patch: Partial<Pick<DeskItem, 'widthMm' | 'heightMm' | 'x' | 'y'>>) => void
  alignSelected: (mode: AlignMode) => void
  distributeSelected: (axis: DistributeAxis) => void
  updateDesk: (field: 'deskWidthMm' | 'deskHeightMm', value: number) => void
  createNewPlan: () => void
  duplicatePlan: () => void
  selectPlan: (id: string) => void
  deleteCurrentPlan: () => void
  openPreview: () => void
  closePreview: () => void
}

const emptyInspection = { analysis: { overlapIds: [], outOfBoundsIds: [], coveragePercent: 0, status: 'clear' as const }, issueIds: [], issueCount: 0 }

export function useWorkspaceViewModel(repository?: WorkspaceRepository): WorkspaceViewModel {
  const repositoryRef = useRef(repository ?? new LocalWorkspaceRepository())
  const [status, setStatus] = useState<WorkspaceStatus>('loading')
  const [document, setDocument] = useState<WorkspaceDocument | null>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [feedback, setFeedback] = useState('正在准备你的工作台…')
  const pendingArrangeRef = useRef<string | null>(null)

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

  const selectItem = useCallback((id: string | null) => {
    pendingArrangeRef.current = null
    setSelectedItemIds(id ? [id] : [])
  }, [])

  const toggleSelectItem = useCallback((id: string) => {
    pendingArrangeRef.current = null
    setSelectedItemIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id])
  }, [])

  const selectItems = useCallback((ids: string[], additive: boolean) => {
    pendingArrangeRef.current = null
    setSelectedItemIds((current) => additive ? [...new Set([...current, ...ids])] : ids)
  }, [])

  const addItem = useCallback((type: DeviceType) => {
    if (!activePlan) return
    pendingArrangeRef.current = null
    const draft = createMaterialDraft(type, activePlan.items.length)
    updateActivePlan((plan) => ({ ...plan, items: [...plan.items, draft.item] }), draft.feedback)
    setSelectedItemIds([draft.item.id])
  }, [activePlan, updateActivePlan])

  const removeItems = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    pendingArrangeRef.current = null
    const removed = new Set(ids)
    updateActivePlan(
      (plan) => ({ ...plan, items: plan.items.filter((item) => !removed.has(item.id)) }),
      ids.length > 1 ? `已移除 ${ids.length} 件设备` : '设备已移除',
    )
    setSelectedItemIds((current) => current.filter((id) => !removed.has(id)))
  }, [updateActivePlan])

  const removeItem = useCallback((id: string) => removeItems([id]), [removeItems])

  const moveItems = useCallback((updates: Array<{ id: string; x: number; y: number }>) => {
    if (updates.length === 0) return
    pendingArrangeRef.current = null
    const positionById = new Map(updates.map((update) => [update.id, update]))
    updateActivePlan((plan) => ({
      ...plan,
      items: plan.items.map((item) => {
        const position = positionById.get(item.id)
        return position ? { ...item, x: position.x, y: position.y } : item
      }),
    }), '位置已更新')
  }, [updateActivePlan])

  const moveItem = useCallback((id: string, x: number, y: number) => {
    updateActivePlan((plan) => ({ ...plan, items: moveCanvasItem(plan.items, id, x, y) }), '位置已更新')
  }, [updateActivePlan])

  const rotateItem = useCallback((id: string, delta: number) => {
    pendingArrangeRef.current = null
    updateActivePlan((plan) => ({ ...plan, items: rotateCanvasItem(plan.items, id, delta) }), '角度已更新')
  }, [updateActivePlan])

  const updateItem = useCallback((id: string, patch: Partial<Pick<DeskItem, 'widthMm' | 'heightMm' | 'x' | 'y'>>) => {
    pendingArrangeRef.current = null
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

  const runArrangement = useCallback((label: string, signature: string, compute: (items: DeskItem[]) => DeskItem[]) => {
    if (!activePlan) return
    const summary = summarizeArrangementIssues(activePlan, compute(activePlan.items), selectedItemIds)
    if (summary.hasIssues && pendingArrangeRef.current !== signature) {
      pendingArrangeRef.current = signature
      const risks: string[] = []
      if (summary.outOfBoundsCount > 0) risks.push(`${summary.outOfBoundsCount} 件设备将被顶出桌面`)
      if (summary.overlapCount > 0) risks.push(`${summary.overlapCount} 件设备会压住其他设备`)
      setFeedback(`${label}后${risks.join('、')}，再次点击「${label}」确认执行`)
      return
    }
    pendingArrangeRef.current = null
    updateActivePlan(
      (plan) => ({ ...plan, items: compute(plan.items) }),
      summary.hasIssues ? `${label}完成，请留意红色标记的设备` : `${label}完成`,
    )
  }, [activePlan, selectedItemIds, updateActivePlan])

  const alignSelected = useCallback((mode: AlignMode) => {
    if (selectedItemIds.length < 2) {
      setFeedback('请先在画布上选择至少 2 件设备')
      return
    }
    const signature = `align:${mode}:${[...selectedItemIds].sort().join('|')}`
    runArrangement(ALIGN_LABELS[mode], signature, (items) => alignItems(items, selectedItemIds, mode))
  }, [runArrangement, selectedItemIds])

  const distributeSelected = useCallback((axis: DistributeAxis) => {
    if (selectedItemIds.length < 3) {
      setFeedback('等距分布至少需要 3 件设备')
      return
    }
    const signature = `distribute:${axis}:${[...selectedItemIds].sort().join('|')}`
    runArrangement(DISTRIBUTE_LABELS[axis], signature, (items) => distributeItems(items, selectedItemIds, axis))
  }, [runArrangement, selectedItemIds])

  const updateDesk = useCallback((field: 'deskWidthMm' | 'deskHeightMm', value: number) => {
    if (!activePlan) return
    updateActivePlan((plan) => ({ ...plan, [field]: clampDeskSize(value, plan[field]) }), '桌面尺寸已更新')
  }, [activePlan, updateActivePlan])

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
    selectedItem,
    selectedItemIds,
    selectedItems,
    analysis,
    issueIds,
    issueCount,
    feedback,
    isPreviewOpen,
    selectItem,
    toggleSelectItem,
    selectItems,
    addItem,
    removeItem,
    removeItems,
    moveItem,
    moveItems,
    rotateItem,
    updateItem,
    alignSelected,
    distributeSelected,
    updateDesk,
    createNewPlan,
    duplicatePlan,
    selectPlan,
    deleteCurrentPlan,
    openPreview,
    closePreview,
  }
}
