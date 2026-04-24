import { headers } from 'next/headers'

export const getForwardedAssemblyHeaders = async (): Promise<Record<string, string>> => {
  const h = await headers()
  const forwarded: Record<string, string> = {}
  const userAgent = h.get('user-agent')
  if (userAgent) forwarded['x-assembly-user-agent'] = userAgent
  const clientIp = h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (clientIp) forwarded['x-assembly-client-ip'] = clientIp
  return forwarded
}
