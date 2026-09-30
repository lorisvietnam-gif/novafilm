import { enLabels } from './en/labels'
import { enProjects } from './en/projects'
import { enShell } from './en/shell'

export const en = {
  ...enShell,
  labels: enLabels,
  ...enProjects,
}
