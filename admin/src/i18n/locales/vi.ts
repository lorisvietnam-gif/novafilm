import { viLabels } from './vi/labels'
import { viProjects } from './vi/projects'
import { viShell } from './vi/shell'

export const vi = {
  ...viShell,
  labels: viLabels,
  ...viProjects,
}
