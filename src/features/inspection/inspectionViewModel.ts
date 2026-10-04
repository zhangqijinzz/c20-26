import { analyzeLayout } from '../../shared/layoutRules'
import type { DeskItem, LayoutAnalysis, WorkspacePlan } from '../../shared/models'

export interface InspectionState {
  analysis: LayoutAnalysis
  issueIds: string[]
  issueCount: number
}

export interface ArrangementIssuePreview {
  outOfBoundsIds: string[]
  overlapIds: string[]
  issueCount: number
}

export function inspectPlan(plan: WorkspacePlan): InspectionState {
  const analysis = analyzeLayout(plan)
  const issueIds = [...new Set([...analysis.overlapIds, ...analysis.outOfBoundsIds])]
  return { analysis, issueIds, issueCount: issueIds.length }
}

export function previewArrangementIssues(plan: WorkspacePlan, nextItems: DeskItem[]): ArrangementIssuePreview {
  const current = analyzeLayout(plan)
  const next = analyzeLayout({ ...plan, items: nextItems })
  const outOfBoundsIds = next.outOfBoundsIds.filter((id) => !current.outOfBoundsIds.includes(id))
  const overlapIds = next.overlapIds.filter((id) => !current.overlapIds.includes(id))
  return { outOfBoundsIds, overlapIds, issueCount: outOfBoundsIds.length + overlapIds.length }
}
