import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ENCRYPTION_PREFIX = 'enc:v1'
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const KEY_BYTES = 32

function getEncryptionSecret(): string | null {
  return (
    process.env.DCCP_CREDENTIAL_ENCRYPTION_KEY ||
    process.env.CREDENTIAL_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    null
  )
}

function getEncryptionKey(): Buffer {
  const secret = getEncryptionSecret()
  if (!secret) {
    throw new Error(
      'Missing encryption secret. Set DCCP_CREDENTIAL_ENCRYPTION_KEY, CREDENTIAL_ENCRYPTION_KEY, AUTH_SECRET, or NEXTAUTH_SECRET.',
    )
  }

  return createHash('sha256').update(secret).digest().subarray(0, KEY_BYTES)
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(`${ENCRYPTION_PREFIX}:`)
}

export function encryptSecret(plainText: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv, {
    authTagLength: AUTH_TAG_BYTES,
  })

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    ENCRYPTION_PREFIX,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':')
}

export function decryptSecret(value: string): string {
  if (!isEncryptedSecret(value)) {
    return value
  }

  const [, version, ivBase64, authTagBase64, encryptedBase64] = value.split(':')
  if (version !== 'v1' || !ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error('Encrypted secret has an invalid format.')
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivBase64, 'base64url'),
    { authTagLength: AUTH_TAG_BYTES },
  )
  decipher.setAuthTag(Buffer.from(authTagBase64, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
