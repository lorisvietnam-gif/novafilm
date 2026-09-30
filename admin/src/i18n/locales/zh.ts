import { zhLabels } from './zh/labels'
import { zhProjects } from './zh/projects'
import { zhQueues } from './zh/queues'
import { zhTasks } from './zh/tasks'
import { zhShell } from './zh/shell'

export const zh = {
  ...zhShell,
  labels: zhLabels,
  ...zhQueues,
  ...zhTasks,
  ...zhProjects,
}
