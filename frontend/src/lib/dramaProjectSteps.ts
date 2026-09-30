/** Các bước trong luồng dự án Drama: dàn ý → storyboard → tạo video */

import { localized, type LocalizedText } from './localeStrings'

export type ProjectStepKey = 'outline' | 'storyboard' | 'video'
export type WorkspaceViewKey = ProjectStepKey | 'assets' | 'episodes'

export type ProjectStepItem = {
  key: ProjectStepKey
  label: string
  order: number
}

/** Step display names. `key` is the stable value; `label` is resolved on read. */
const STEP_LABELS: Record<ProjectStepKey, LocalizedText> = {
  outline: { zh: '剧情大纲', en: 'Outline', vi: 'Dàn ý' },
  storyboard: { zh: '分镜', en: 'Storyboard', vi: 'Storyboard' },
  video: { zh: '生成视频', en: 'Generate video', vi: 'Tạo video' },
}

function stepItem(key: ProjectStepKey, order: number): ProjectStepItem {
  return {
    key,
    order,
    get label() {
      return localized(STEP_LABELS[key])
    },
  }
}

export type WorkspaceLocationState = {
  activeStep?: WorkspaceViewKey
  returnStep?: ProjectStepKey | 'episodes'
}

// Có kịch bản thì đi qua dàn ý; chưa có thì vào thẳng storyboard (danh sách tập)
export function buildProjectSteps(hasScript: boolean): ProjectStepItem[] {
  const keys: ProjectStepKey[] = hasScript ? ['outline', 'storyboard', 'video'] : ['storyboard', 'video']
  return keys.map(stepItem)
}

export function getInitialProjectStep(hasScript: boolean): ProjectStepKey {
  return hasScript ? 'outline' : 'storyboard'
}

export function isProjectStepKey(value: string | undefined): value is ProjectStepKey {
  return value === 'outline' || value === 'storyboard' || value === 'video'
}

/** Map state cũ activeStep=episodes sang storyboard */
export function normalizeWorkspaceStep(value: string | undefined): ProjectStepKey | 'assets' | null {
  if (value === 'assets') return 'assets'
  if (value === 'episodes' || value === 'storyboard' || value === 'video') {
    return value === 'episodes' ? 'storyboard' : value
  }
  if (value === 'outline') return 'outline'
  return null
}

export function getNextProjectStep(
  steps: ProjectStepItem[],
  currentStep: ProjectStepKey,
): ProjectStepKey | null {
  const currentIndex = steps.findIndex((step) => step.key === currentStep)
  if (currentIndex < 0 || currentIndex >= steps.length - 1) return null
  return steps[currentIndex + 1].key
}

/** Cả storyboard lẫn tạo video đều dẫn tới route của tập */
export function isEpisodesRouteStep(step: ProjectStepKey | string | undefined): boolean {
  return step === 'storyboard' || step === 'video' || step === 'episodes'
}
