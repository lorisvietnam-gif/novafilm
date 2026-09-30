import { zhLabels } from './zh/labels'
import { zhProjects } from './zh/projects'
import { zhShell } from './zh/shell'

export const zh = {
  ...zhShell,
  labels: zhLabels,
  ...zhProjects,
}
