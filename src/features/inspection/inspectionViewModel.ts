import { analyzeLayout } from '../../shared/layoutRules'
import type { DeskItem, LayoutAnalysis, WorkspacePlan } from '../../shared/models'

export interface InspectionState {
  analysis: LayoutAnalysis
  issueIds: string[]
  issueCount: number
}

export interface ArrangementIssueSummary {
  outOfBoundsCount: number
  overlapCount: number
  hasIssues: boolean
}

export function inspectPlan(plan: WorkspacePlan): InspectionState {
  const analysis = analyzeLayout(plan)
  const issueIds = [...new Set([...analysis.overlapIds, ...analysis.outOfBoundsIds])]
  return { analysis, issueIds, issueCount: issueIds.length }
}

export function summarizeArrangementIssues(plan: WorkspacePlan, nextItems: DeskItem[], movedIds: string[]): ArrangementIssueSummary {
  const analysis = analyzeLayout({ ...plan, items: nextItems })
  const moved = new Set(movedIds)
  const outOfBoundsCount = analysis.outOfBoundsIds.filter((id) => moved.has(id)).length
  const overlapCount = analysis.overlapIds.filter((id) => moved.has(id)).length
  return { outOfBoundsCount, overlapCount, hasIssues: outOfBoundsCount + overlapCount > 0 }
}
