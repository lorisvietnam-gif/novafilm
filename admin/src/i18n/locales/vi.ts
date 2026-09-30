import { viDrama } from './vi/drama'
import { viDashboard } from './vi/dashboard'
import { viLabels } from './vi/labels'
import { viOrders } from './vi/orders'
import { viProjects } from './vi/projects'
import { viQueues } from './vi/queues'
import { viTasks } from './vi/tasks'
import { viSettings } from './vi/settings'
import { viTemplates } from './vi/templates'
import { viUsers } from './vi/users'
import { viShell } from './vi/shell'

export const vi = {
  ...viShell,
  labels: viLabels,
  ...viDrama,
  ...viDashboard,
  ...viQueues,
  ...viTasks,
  ...viSettings,
  ...viOrders,
  ...viProjects,
  ...viUsers,
  ...viTemplates,
}
