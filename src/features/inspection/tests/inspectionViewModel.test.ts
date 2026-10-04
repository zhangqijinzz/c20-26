import { describe, expect, it } from 'vitest'
import { createItem, createPlan } from '../../../shared/models'
import { inspectPlan, previewArrangementIssues } from '../inspectionViewModel'

describe('inspection module', () => {
  it('turns layout analysis into a user-facing issue summary', () => {
    const plan = createPlan('检查', false)
    const first = { ...createItem('monitor'), x: 0, y: 0 }
    const second = { ...createItem('keyboard'), x: 100, y: 80 }
    const result = inspectPlan({ ...plan, items: [first, second] })
    expect(result.issueCount).toBe(2)
    expect(result.issueIds).toEqual(expect.arrayContaining([first.id, second.id]))
  })

  it('previews only the issues an arrangement would newly introduce', () => {
    const plan = createPlan('预检', false)
    const first = { ...createItem('monitor'), x: 0, y: 0, widthMm: 400, heightMm: 200 }
    const second = { ...createItem('keyboard'), x: 100, y: 50, widthMm: 400, heightMm: 200 }
    const third = { ...createItem('lamp'), x: 800, y: 400 }
    const items = [first, second, third]
    // first 与 second 本来就重叠，属于既有问题，不应计入预检
    const pushedOut = items.map((item) => item.id === third.id ? { ...item, x: 1700 } : item)
    const preview = previewArrangementIssues({ ...plan, items }, pushedOut)
    expect(preview.outOfBoundsIds).toEqual([third.id])
    expect(preview.overlapIds).toEqual([])
    expect(preview.issueCount).toBe(1)
  })

  it('reports a clean preview when the arrangement introduces no issues', () => {
    const plan = createPlan('预检', false)
    const first = { ...createItem('monitor'), x: 0, y: 0, widthMm: 400, heightMm: 200 }
    const second = { ...createItem('keyboard'), x: 800, y: 400 }
    const items = [first, second]
    const shifted = items.map((item) => item.id === second.id ? { ...item, x: 900 } : item)
    const preview = previewArrangementIssues({ ...plan, items }, shifted)
    expect(preview.issueCount).toBe(0)
  })
})
