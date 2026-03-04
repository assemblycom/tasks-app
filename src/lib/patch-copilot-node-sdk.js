import { DefaultService as Assembly, OpenAPI } from '../codegen/api'
export { OpenAPI }
import { request as __request } from '../codegen/api/core/request'
import { decryptAES128BitToken, generate128BitKey } from '../utils/crypto'
// SDK version for tracking compatibility
// TODO: Restore dynamic version reading after fixing build
let SDK_VERSION = '3.19.1'
const sdk = Assembly
// Helper functions to check env vars at runtime (supports both new and old names)
function getIsDebug() {
  let _a
  return !!((_a = process.env.ASSEMBLY_DEBUG) !== null && _a !== void 0 ? _a : process.env.COPILOT_DEBUG)
}
function getEnvMode() {
  let _a
  return (_a = process.env.ASSEMBLY_ENV) !== null && _a !== void 0 ? _a : process.env.COPILOT_ENV
}
// Exported for testing purposes only
export function processToken(token) {
  try {
    const json = JSON.parse(token)
    // workspaceId is the only required field
    if (!('workspaceId' in json)) {
      throw new Error('Missing required field in token payload: workspaceId')
    }
    // Note: We intentionally do NOT validate that all keys are from a known list.
    // This allows the backend to add new fields (like tokenId, expiresAt) without
    // breaking older SDK versions. Unknown fields are simply ignored.
    const areAllValuesValid = Object.values(json).every((val) => typeof val === 'string')
    if (!areAllValuesValid) {
      throw new Error('Invalid values in token payload.')
    }
    const result = {
      companyId: json.companyId,
      clientId: json.clientId,
      internalUserId: json.internalUserId,
      workspaceId: json.workspaceId,
      notificationId: json.notificationId,
      baseUrl: json.baseUrl,
      tokenId: json.tokenId,
    }
    return result
  } catch (e) {
    if (getIsDebug()) {
      console.error(e)
    }
    return null
  }
}
// Primary function (new name)
export function assemblyApi({ apiKey, token: tokenString }) {
  const isDebug = getIsDebug()
  const envMode = getEnvMode()
  let key = ['local', '__SECRET_STAGING__'].includes(envMode !== null && envMode !== void 0 ? envMode : '')
    ? apiKey
    : undefined
  if (isDebug) {
    console.log('Debugging the assemblyApi init script.')
    console.log({ env: envMode })
  }
  if (tokenString) {
    if (isDebug) {
      console.log({ tokenString, apiKey })
    }
    try {
      const decipherKey = generate128BitKey(apiKey)
      const decryptedPayload = decryptAES128BitToken(decipherKey, tokenString)
      if (isDebug) {
        console.log('Decrypted Payload:', decryptedPayload)
      }
      const payload = processToken(decryptedPayload)
      if (!payload) {
        throw new Error('Invalid token payload.')
      }
      if (isDebug) {
        console.log('Payload:', payload)
      }
      if (payload.baseUrl) {
        OpenAPI.BASE = payload.baseUrl
      }
      sdk.getTokenPayload = () => new Promise((resolve) => resolve(payload))
      // Build the key: workspaceId/apiKey or workspaceId/apiKey/tokenId if tokenId is present
      key = payload.tokenId ? `${payload.workspaceId}/${apiKey}/${payload.tokenId}` : `${payload.workspaceId}/${apiKey}`
    } catch (error) {
      console.error(error)
    }
  }
  if (!key) {
    console.warn(
      'We were unable to authorize the SDK. If you are working in a local development environment, set the ASSEMBLY_ENV environment variable to "local" (COPILOT_ENV also works).',
    )
    throw new Error('Unable to authorize Assembly SDK.')
  }

  // TEMPORARY FIX: suppress sending tokenId to auth header

  const [org, project] = key.split('/')

  if (!org || !project) {
    throw new Error(`Invalid auth header`)
  }

  key = `${org}/${project}`
  // disable SDK version to prevent expiry logic from triggering (?)
  SDK_VERSION = undefined

  // TEMPORARY FIX END

  if (isDebug) {
    console.log(`Authorizing with key: ${key}`)
  }

  OpenAPI.HEADERS = {
    'X-API-Key': key,
    'X-Assembly-SDK-Version': SDK_VERSION,
  }
  sdk.sendWebhook = (event, payload) => {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/v1/webhooks/{event}',
      path: { event },
      body: payload,
      mediaType: 'application/json',
    })
  }
  return sdk
}
/** @deprecated Use `assemblyApi` instead. Will be removed in v5.0.0. */
export const copilotApi = assemblyApi
//# sourceMappingURL=init.js.map
