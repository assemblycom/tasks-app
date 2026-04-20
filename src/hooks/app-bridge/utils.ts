import { DASHBOARD_DOMAIN } from '@/constants/domains'

export const postMessageParentDashboard = (payload: object) => {
  for (const domain of DASHBOARD_DOMAIN) {
    window.parent.postMessage(payload, domain)
  }
}
