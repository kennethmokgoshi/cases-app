import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { decryptSecret, encryptSecret, isEncryptedSecret } from './encryption'

const originalEnv = { ...process.env }

describe('secret encryption', () => {
  beforeEach(() => {
    process.env.DCCP_CREDENTIAL_ENCRYPTION_KEY = 'test-key-material'
    delete process.env.CREDENTIAL_ENCRYPTION_KEY
    delete process.env.AUTH_SECRET
    delete process.env.NEXTAUTH_SECRET
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('encrypts and decrypts a secret without storing plaintext', () => {
    const encrypted = encryptSecret('portal-password')

    expect(isEncryptedSecret(encrypted)).toBe(true)
    expect(encrypted).not.toContain('portal-password')
    expect(decryptSecret(encrypted)).toBe('portal-password')
  })

  it('passes legacy plaintext values through during rollout', () => {
    expect(isEncryptedSecret('legacy-password')).toBe(false)
    expect(decryptSecret('legacy-password')).toBe('legacy-password')
  })

  it('requires configured key material before encrypting', () => {
    delete process.env.DCCP_CREDENTIAL_ENCRYPTION_KEY

    expect(() => encryptSecret('portal-password')).toThrow('Missing encryption secret')
  })
})
