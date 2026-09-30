import { zhDashboard } from './zh/dashboard'
import { zhLabels } from './zh/labels'
import { zhOrders } from './zh/orders'
import { zhProjects } from './zh/projects'
import { zhQueues } from './zh/queues'
import { zhTasks } from './zh/tasks'
import { zhShell } from './zh/shell'

export const zh = {
  ...zhShell,
  labels: zhLabels,
  ...zhDashboard,
  ...zhQueues,
  ...zhTasks,
  ...zhOrders,
  ...zhProjects,
}
