import { zhDrama } from './zh/drama'
import { zhDashboard } from './zh/dashboard'
import { zhLabels } from './zh/labels'
import { zhOrders } from './zh/orders'
import { zhProjects } from './zh/projects'
import { zhQueues } from './zh/queues'
import { zhTasks } from './zh/tasks'
import { zhSettings } from './zh/settings'
import { zhTemplates } from './zh/templates'
import { zhUsers } from './zh/users'
import { zhShell } from './zh/shell'

export const zh = {
  ...zhShell,
  labels: zhLabels,
  ...zhDrama,
  ...zhDashboard,
  ...zhQueues,
  ...zhTasks,
  ...zhSettings,
  ...zhOrders,
  ...zhProjects,
  ...zhUsers,
  ...zhTemplates,
}
