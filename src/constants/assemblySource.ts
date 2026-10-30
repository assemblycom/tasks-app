// Values of the `x-assembly-source` header the Assembly proxy sets on requests it forwards.
// `web` and `platform` are the fallbacks for direct browser / public-API requests.
export const AssemblySource = {
  web: 'web',
  platform: 'platform',
  automation: 'automation',
} as const
