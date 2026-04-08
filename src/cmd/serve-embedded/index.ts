import ngrok from '@ngrok/ngrok'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import next from 'next'
import { apps, default as open } from 'open'
import { parse } from 'url'

import dotenv from 'dotenv'
import { DASHBOARD_DOMAIN } from '@/constants/domains'
dotenv.config()

const port = parseInt(process.env.PORT ?? '3000', 10)
const dev = true
const app = next({ dev })
const handle = app.getRequestHandler()

const createNgrokTunnel = async (port: number): Promise<string> => {
  console.info('> Opening an ngrok tunnel to the server...')
  const listener = await ngrok.forward({
    authtoken: process.env.NGROK_AUTHTOKEN,
    addr: port,
  })

  const ngrokUrl = listener.url()
  if (!ngrokUrl) {
    throw new Error('Failed to get a ngrok URL for the tunnel')
  }

  console.info(`> Tunnel opened at ${ngrokUrl}`)
  return ngrokUrl
}

const openDashboard = async (appUrl: string) => {
  const url = `${DASHBOARD_DOMAIN[0]}/dev-mode?url=${encodeURIComponent(appUrl)}`
  console.info(`> Opening browser at ${url}`)

  const browserApp = Array.isArray(apps.browser) ? apps.browser[0] : apps.browser
  await open(url, { app: browserApp })
}

const handleProcessEvents = () => {
  process.stdin.resume()

  process.on('SIGINT', async () => {
    console.info('> Closing ngrok tunnel...')
    await ngrok.kill()
    console.info('> Ngrok tunnel closed.')
    process.exit()
  })
}

async function startServer() {
  await app.prepare()

  const useNgrok = !!process.env.NGROK_AUTHTOKEN
  const appUrl = useNgrok ? await createNgrokTunnel(port) : `http://localhost:${port}`

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.statusCode = 400
      res.end('Bad Request: Missing URL')
      return
    }

    const parsedUrl = parse(req.url, true)
    res.setHeader('Set-Cookie', `appUrl=${appUrl}`)
    res.setHeader('X-Frame-Options', '')
    handle(req, res, parsedUrl)
  })

  server.listen(port, () => {
    console.info(`> Server listening at http://localhost:${port}`)
  })

  await openDashboard(appUrl)
  handleProcessEvents()
}

startServer().catch((err) => {
  console.error('Error starting server:', err)
  process.exit(1)
})
