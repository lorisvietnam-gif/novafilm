import { enLabels } from './en/labels'
import { enOrders } from './en/orders'
import { enProjects } from './en/projects'
import { enQueues } from './en/queues'
import { enTasks } from './en/tasks'
import { enShell } from './en/shell'

export const en = {
  ...enShell,
  labels: enLabels,
  ...enQueues,
  ...enTasks,
  ...enOrders,
  ...enProjects,
}
