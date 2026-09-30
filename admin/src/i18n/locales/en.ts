import { enDashboard } from './en/dashboard'
import { enLabels } from './en/labels'
import { enOrders } from './en/orders'
import { enProjects } from './en/projects'
import { enQueues } from './en/queues'
import { enTasks } from './en/tasks'
import { enSettings } from './en/settings'
import { enTemplates } from './en/templates'
import { enUsers } from './en/users'
import { enShell } from './en/shell'

export const en = {
  ...enShell,
  labels: enLabels,
  ...enDashboard,
  ...enQueues,
  ...enTasks,
  ...enSettings,
  ...enOrders,
  ...enProjects,
  ...enUsers,
  ...enTemplates,
}
