import { viLabels } from './vi/labels'
import { viProjects } from './vi/projects'
import { viQueues } from './vi/queues'
import { viTasks } from './vi/tasks'
import { viShell } from './vi/shell'

export const vi = {
  ...viShell,
  labels: viLabels,
  ...viQueues,
  ...viTasks,
  ...viProjects,
}
