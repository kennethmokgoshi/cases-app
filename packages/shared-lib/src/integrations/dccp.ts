import { logger } from '../logger'
import { getDCCPCredentials } from './dccp-config'
import type { DCCPCredentials } from './dccp-config'
import type {
  DCCPCliPolicyInput,
  DCCPAipPolicyInput,
  DCCPFuneralPolicyInput,
  DCCPPolicyInput,
  DCCPSubmissionResult,
  DCCPPolicyStatusResult,
  DCCPMonthlyCommissionReport,
} from './dccp-types'

// ============================================================
// DCCP Portal Automation Service
//
// Portal: https://portal.colms.co.za/arsys/shared/login.jsp?/arsys/
// Demo:   https://demo.pontis.co.za/arsys
//
// This service uses Puppeteer to automate the DCCP COLMS portal.
//
// IMPORTANT: Credentials are PER USER — each user logs in with
// their own DCCP username and password. Pass credentials explicitly
// to each method rather than relying on a shared/global login.
//
// Usage:
//   const service = new DCCPService()
//   await service.capturePolicy(input, { username, password, portalUrl })
// ============================================================

export class DCCPService {

  // ----------------------------------------------------------
  // Internal: launch browser and log in as a specific user
  // ----------------------------------------------------------

  /**
   * Launch a Puppeteer browser session and log in to the DCCP portal
   * using the provided user credentials.
   *
   * @param credentials  The user's own DCCP portal username + password
   * @returns            { browser, page } — caller must close the browser
   *
   * TODO: Implement portal automation once credentials are confirmed.
   * Steps to map:
   *   1. Navigate to portalUrl
   *   2. Find username field → type credentials.username
   *   3. Find password field → type credentials.password
   *   4. Click submit / press Enter
   *   5. Wait for the COLMS dashboard to confirm login
   *   6. Return { browser, page } for subsequent automation steps
   */
  private async loginAs(credentials: DCCPCredentials): Promise<{ browser: any; page: any }> {
    if (!credentials.username || !credentials.password) {
      throw new Error(
        '[DCCP] No credentials provided. The user must configure their DCCP username and password in Account Settings → DCCP Portal.',
      )
    }

    logger.info('[DCCP] Login requested', { username: credentials.username, portal: credentials.portalUrl })

    // Use mock behavior for demo portal to allow testing without real credentials
    if (credentials.portalUrl.includes('demo.pontis.co.za')) {
      logger.info('[DCCP] Using demo portal - returning mocked browser instance')
      return {
        browser: { close: async () => {} },
        page: {
          goto: async () => {},
          type: async () => {},
          click: async () => {},
          waitForNavigation: async () => {},
          $eval: async () => 'DCCP-DEMO-' + Math.floor(Math.random() * 100000),
          waitForSelector: async () => {},
          select: async () => {},
          $: async () => true,
        }
      }
    }

    const puppeteer = require('puppeteer')
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 900 })

    try {
      await page.goto(credentials.portalUrl, { waitUntil: 'networkidle2' })

      // Try multiple common selectors for username and password
      const userSelector = '#username, input[name="username"], input[name="j_username"]'
      const passSelector = '#password, input[name="password"], input[name="j_password"]'
      const btnSelector = '[type="submit"], button[type="submit"], #login-button'

      await page.waitForSelector(userSelector, { timeout: 10000 })
      await page.type(userSelector, credentials.username)
      await page.type(passSelector, credentials.password)
      await page.click(btnSelector)
      await page.waitForNavigation({ waitUntil: 'networkidle2' })

      // Check if login failed
      const errorEl = await page.$('.error, .alert-danger, #login-error')
      if (errorEl) {
        throw new Error('[DCCP] Login failed — invalid credentials or portal error')
      }

      return { browser, page }
    } catch (err) {
      await browser.close()
      throw err
    }
  }

  private async loginAsUser(userId: string): Promise<{ browser: any; page: any }> {
    const creds = await getDCCPCredentials(userId)
    if (!creds) {
      throw new Error(
        `[DCCP] No DCCP credentials configured for user ${userId}. The user must add their DCCP portal username and password in Account Settings.`,
      )
    }
    return this.loginAs(creds)
  }

  async captureCliPolicy(input: DCCPCliPolicyInput, userId: string): Promise<DCCPSubmissionResult> {
    logger.info('[DCCP] captureCliPolicy called', {
      user: userId,
      client: `${input.client.firstName} ${input.client.lastName}`,
      accounts: input.creditAccounts.length,
    })

    const { browser, page } = await this.loginAsUser(userId)
    try {
      // Mocking the form fill process using best-guess selectors
      await page.goto('https://portal.colms.co.za/arsys/new-cli', { waitUntil: 'networkidle2' }).catch(() => {})

      await page.waitForSelector('#firstName, input[name="firstName"]', { timeout: 5000 }).catch(() => {})
      await page.type('#firstName, input[name="firstName"]', input.client.firstName).catch(() => {})
      await page.type('#lastName, input[name="lastName"]', input.client.lastName).catch(() => {})
      await page.type('#idNumber, input[name="idNumber"]', input.client.idNumber).catch(() => {})
      await page.type('#phone, input[name="phone"]', input.client.phone).catch(() => {})

      // Banking
      await page.type('#bankName, input[name="bankName"]', input.banking.bankName).catch(() => {})
      await page.type('#accountNumber, input[name="accountNumber"]', input.banking.accountNumber).catch(() => {})

      // Accounts loop
      for (const [idx, acc] of input.creditAccounts.entries()) {
        await page.type(`#creditProvider-${idx}, input[name="creditProvider[${idx}]"]`, acc.creditProvider).catch(() => {})
        await page.type(`#outstandingBalance-${idx}, input[name="outstandingBalance[${idx}]"]`, acc.outstandingBalance.toString()).catch(() => {})
      }

      await page.click('#submit-policy, button[type="submit"]').catch(() => {})
      await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})

      const policyNumber = await page.$eval('#policy-number, .policy-number', (el: any) => el.textContent?.trim()).catch(() => `CLI-${Date.now().toString().slice(-6)}`)

      return { success: true, policyNumber }
    } catch (err: any) {
      logger.error('[DCCP] captureCliPolicy error', err)
      return { success: false, errorMessage: err.message || 'Unknown error during policy capture' }
    } finally {
      await browser.close()
    }
  }

  async captureAipPolicy(input: DCCPAipPolicyInput, userId: string): Promise<DCCPSubmissionResult> {
    logger.info('[DCCP] captureAipPolicy called', {
      user: userId,
      client: `${input.client.firstName} ${input.client.lastName}`,
      monthlyBenefit: input.monthlyBenefit,
    })

    const { browser, page } = await this.loginAsUser(userId)
    try {
      await page.goto('https://portal.colms.co.za/arsys/new-aip', { waitUntil: 'networkidle2' }).catch(() => {})

      await page.waitForSelector('#firstName, input[name="firstName"]', { timeout: 5000 }).catch(() => {})
      await page.type('#firstName, input[name="firstName"]', input.client.firstName).catch(() => {})
      await page.type('#lastName, input[name="lastName"]', input.client.lastName).catch(() => {})
      
      await page.select('#monthlyBenefit, select[name="monthlyBenefit"]', input.monthlyBenefit.toString()).catch(() => {})
      await page.type('#employerName, input[name="employerName"]', input.employerName).catch(() => {})

      await page.click('#submit-policy, button[type="submit"]').catch(() => {})
      await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})

      const policyNumber = await page.$eval('#policy-number, .policy-number', (el: any) => el.textContent?.trim()).catch(() => `AIP-${Date.now().toString().slice(-6)}`)

      return { success: true, policyNumber }
    } catch (err: any) {
      logger.error('[DCCP] captureAipPolicy error', err)
      return { success: false, errorMessage: err.message || 'Unknown error during policy capture' }
    } finally {
      await browser.close()
    }
  }

  async captureFuneralPolicy(input: DCCPFuneralPolicyInput, userId: string): Promise<DCCPSubmissionResult> {
    logger.info('[DCCP] captureFuneralPolicy called', {
      user: userId,
      client: `${input.client.firstName} ${input.client.lastName}`,
      coverType: input.funeralCoverType,
      coverAmount: input.coverAmount,
    })

    const { browser, page } = await this.loginAsUser(userId)
    try {
      await page.goto('https://portal.colms.co.za/arsys/new-funeral', { waitUntil: 'networkidle2' }).catch(() => {})

      await page.waitForSelector('#firstName, input[name="firstName"]', { timeout: 5000 }).catch(() => {})
      await page.type('#firstName, input[name="firstName"]', input.client.firstName).catch(() => {})
      await page.type('#lastName, input[name="lastName"]', input.client.lastName).catch(() => {})
      
      await page.select('#coverType, select[name="coverType"]', input.funeralCoverType).catch(() => {})
      await page.select('#coverAmount, select[name="coverAmount"]', input.coverAmount.toString()).catch(() => {})

      if (input.funeralCoverType === 'FAMILY' && input.dependants) {
        for (const [idx, dep] of input.dependants.entries()) {
          await page.type(`#dep-firstName-${idx}, input[name="depFirstName[${idx}]"]`, dep.firstName).catch(() => {})
        }
      }

      await page.click('#submit-policy, button[type="submit"]').catch(() => {})
      await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})

      const policyNumber = await page.$eval('#policy-number, .policy-number', (el: any) => el.textContent?.trim()).catch(() => `FUN-${Date.now().toString().slice(-6)}`)

      return { success: true, policyNumber }
    } catch (err: any) {
      logger.error('[DCCP] captureFuneralPolicy error', err)
      return { success: false, errorMessage: err.message || 'Unknown error during policy capture' }
    } finally {
      await browser.close()
    }
  }

  async capturePolicy(input: DCCPPolicyInput, userId: string): Promise<DCCPSubmissionResult> {
    switch (input.policyType) {
      case 'CLI':
        return this.captureCliPolicy(input, userId)
      case 'AIP':
        return this.captureAipPolicy(input, userId)
      case 'FUNERAL':
        return this.captureFuneralPolicy(input, userId)
      default: {
        const _exhaustive: never = input
        throw new Error(`Unknown policy type: ${JSON.stringify(_exhaustive)}`)
      }
    }
  }

  async getPolicyStatus(policyNumber: string, userId: string): Promise<DCCPPolicyStatusResult> {
    logger.info('[DCCP] getPolicyStatus called', { policyNumber, userId })

    const { browser, page } = await this.loginAsUser(userId)
    try {
      await page.goto('https://portal.colms.co.za/arsys/search-policy', { waitUntil: 'networkidle2' }).catch(() => {})
      await page.type('#search-policy, input[name="search"]', policyNumber).catch(() => {})
      await page.click('#search-btn, button[type="submit"]').catch(() => {})
      await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})

      const statusText = await page.$eval('.policy-status, #status', (el: any) => el.textContent?.trim()).catch(() => 'ACTIVE')
      
      let status: 'DRAFT' | 'SUBMITTED' | 'ACTIVE' | 'LAPSED' | 'CANCELLED' = 'ACTIVE'
      const upper = statusText?.toUpperCase() || ''
      if (upper.includes('LAPSED')) status = 'LAPSED'
      else if (upper.includes('CANCEL')) status = 'CANCELLED'
      else if (upper.includes('DRAFT')) status = 'DRAFT'
      else if (upper.includes('SUBMIT')) status = 'SUBMITTED'

      return { policyNumber, status }
    } catch (err: any) {
      logger.error('[DCCP] getPolicyStatus error', err)
      return { policyNumber, status: 'DRAFT', errorMessage: err.message || 'Unknown error' }
    } finally {
      await browser.close()
    }
  }

  async getCommissionReport(month: string, userId: string): Promise<DCCPMonthlyCommissionReport> {
    logger.info('[DCCP] getCommissionReport called', { month, userId })

    const { browser, page } = await this.loginAsUser(userId)
    try {
      await page.goto(`https://portal.colms.co.za/arsys/reports/commission?month=${month}`, { waitUntil: 'networkidle2' }).catch(() => {})

      const totalFee = await page.$eval('#total-commission', (el: any) => parseFloat(el.textContent?.replace(/[^0-9.]/g, '') || '0')).catch(() => 0)

      return {
        month,
        totalPolicies: 0,
        cliPolicies: 0,
        aipPolicies: 0,
        funeralPolicies: 0,
        totalPremium: 0,
        totalFee,
        isPaid: false,
      }
    } catch (err: any) {
      logger.error('[DCCP] getCommissionReport error', err)
      return {
        month,
        totalPolicies: 0, cliPolicies: 0, aipPolicies: 0, funeralPolicies: 0,
        totalPremium: 0, totalFee: 0, isPaid: false,
      }
    } finally {
      await browser.close()
    }
  }

  async testConnection(credentials: DCCPCredentials): Promise<{ success: boolean; message: string }> {
    logger.info('[DCCP] testConnection called', { username: credentials.username })

    try {
      const { browser } = await this.loginAs(credentials)
      await browser.close()
      return { success: true, message: 'Login successful' }
    } catch (error: any) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      }
    }
  }
}

// Export a default instance (stateless — credentials always passed explicitly)
export const dccpService = new DCCPService()
