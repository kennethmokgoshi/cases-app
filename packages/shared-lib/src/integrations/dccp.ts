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
  private async loginAs(credentials: DCCPCredentials): Promise<{ browser: unknown; page: unknown }> {
    if (!credentials.username || !credentials.password) {
      throw new Error(
        '[DCCP] No credentials provided. The user must configure their DCCP username and password in Account Settings → DCCP Portal.',
      )
    }

    logger.info('[DCCP] Login requested', { username: credentials.username, portal: credentials.portalUrl })

    // TODO: Implement when portal access is confirmed
    // const puppeteer = await import('puppeteer')
    // const browser = await puppeteer.launch({
    //   headless: true,
    //   args: ['--no-sandbox', '--disable-setuid-sandbox'],
    // })
    // const page = await browser.newPage()
    // await page.setViewport({ width: 1280, height: 900 })
    // await page.goto(credentials.portalUrl, { waitUntil: 'networkidle2' })
    //
    // // Fill login form (field selectors need to be verified against the live portal)
    // await page.waitForSelector('#username', { timeout: 10000 })
    // await page.type('#username', credentials.username)
    // await page.type('#password', credentials.password)
    // await page.click('[type="submit"]')
    // await page.waitForNavigation({ waitUntil: 'networkidle2' })
    //
    // // Confirm login by checking for a dashboard element
    // const loggedIn = await page.$('.dashboard, #main-content, .home-page')
    // if (!loggedIn) throw new Error('[DCCP] Login failed — dashboard not found after submit')
    //
    // return { browser, page }

    throw new Error('[DCCP] Portal automation not yet implemented — credentials pending confirmation')
  }

  // ----------------------------------------------------------
  // Public: resolve credentials by userId and call loginAs
  // ----------------------------------------------------------

  /**
   * Resolve credentials for a user from the database, then log in.
   * Used when triggering automation from an API route (userId from session).
   */
  private async loginAsUser(userId: string): Promise<{ browser: unknown; page: unknown }> {
    const creds = await getDCCPCredentials(userId)
    if (!creds) {
      throw new Error(
        `[DCCP] No DCCP credentials configured for user ${userId}. The user must add their DCCP portal username and password in Account Settings.`,
      )
    }
    return this.loginAs(creds)
  }

  // ----------------------------------------------------------
  // Policy capture — CLI
  // ----------------------------------------------------------

  /**
   * Submit a Credit Life Insurance policy to the DCCP portal.
   *
   * @param input   Policy data (client, banking, credit accounts)
   * @param userId  The ID of the staff member triggering this — their own DCCP credentials will be used
   *
   * Portal form fields to map (TODO — fill in when portal is accessible):
   *   Section 1 — Client details
   *     - First name, Last name, SA ID number, Date of birth
   *     - Cell phone, Email, Physical address
   *   Section 2 — Banking / debit order
   *     - Bank name, Account number, Account type (Cheque/Savings), Debit day
   *   Section 3 — Credit accounts (repeat per account)
   *     - Credit provider, Account type, Account number (optional)
   *     - Outstanding balance, Replacement premium
   *   Section 4 — Previous insurance (waiting period waiver)
   *     - Previous insurer name, policy number
   *   Section 5 — Inception date
   */
  async captureCliPolicy(input: DCCPCliPolicyInput, userId: string): Promise<DCCPSubmissionResult> {
    logger.info('[DCCP] captureCliPolicy called', {
      user: userId,
      client: `${input.client.firstName} ${input.client.lastName}`,
      accounts: input.creditAccounts.length,
    })

    // TODO: Implement
    // const { browser, page } = await this.loginAsUser(userId)
    // try {
    //   await page.goto(`${creds.portalUrl}/new-cli`)
    //   // fill fields...
    //   const policyNumber = await page.$eval('#policy-number', (el: Element) => el.textContent?.trim())
    //   return { success: true, policyNumber: policyNumber ?? undefined }
    // } finally {
    //   await (browser as any).close()
    // }

    return { success: false, errorMessage: 'Portal automation not yet implemented — credentials pending' }
  }

  // ----------------------------------------------------------
  // Policy capture — AIP
  // ----------------------------------------------------------

  /**
   * Submit an Assistance Income Protector policy to the DCCP portal.
   *
   * @param input   Policy data (client, banking, benefit tier, employment)
   * @param userId  The triggering user's ID (their own DCCP credentials are used)
   *
   * Portal form fields to map (TODO):
   *   - Client details (same as CLI)
   *   - Monthly benefit: R5 000 / R10 000 / R15 000 selector
   *   - Employer name
   *   - Employment start date
   *   - Banking / debit order details
   *   - Inception date
   */
  async captureAipPolicy(input: DCCPAipPolicyInput, userId: string): Promise<DCCPSubmissionResult> {
    logger.info('[DCCP] captureAipPolicy called', {
      user: userId,
      client: `${input.client.firstName} ${input.client.lastName}`,
      monthlyBenefit: input.monthlyBenefit,
    })

    // TODO: Implement
    return { success: false, errorMessage: 'Portal automation not yet implemented — credentials pending' }
  }

  // ----------------------------------------------------------
  // Policy capture — Funeral
  // ----------------------------------------------------------

  /**
   * Submit a Funeral Cover policy to the DCCP portal.
   *
   * @param input   Policy data (client, banking, cover type/amount, dependants)
   * @param userId  The triggering user's ID
   *
   * Portal form fields to map (TODO):
   *   - Client details
   *   - Cover type: Individual / Family toggle
   *   - Cover amount: R10 000 / R20 000 / R30 000 selector
   *   - Beneficiary: name + relationship
   *   - Dependants (FAMILY only): repeat block per dependant
   *     - Relationship, first name, last name, ID number, cover amount
   *   - Banking / debit order
   *   - Inception date
   */
  async captureFuneralPolicy(input: DCCPFuneralPolicyInput, userId: string): Promise<DCCPSubmissionResult> {
    logger.info('[DCCP] captureFuneralPolicy called', {
      user: userId,
      client: `${input.client.firstName} ${input.client.lastName}`,
      coverType: input.funeralCoverType,
      coverAmount: input.coverAmount,
    })

    // TODO: Implement
    return { success: false, errorMessage: 'Portal automation not yet implemented — credentials pending' }
  }

  // ----------------------------------------------------------
  // Dispatcher
  // ----------------------------------------------------------

  /**
   * Submit any DCCP policy type — dispatches to the correct capture method.
   *
   * @param input   The policy data
   * @param userId  The ID of the user triggering the submission (their credentials are used)
   */
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

  // ----------------------------------------------------------
  // Policy status lookup
  // ----------------------------------------------------------

  /**
   * Look up the current status of a policy on the DCCP portal.
   *
   * @param policyNumber  The policy number assigned by DCCP
   * @param userId        The user whose portal session will be used
   *
   * TODO: Navigate to the policy search screen, search by policy number,
   * scrape the status field and return it.
   */
  async getPolicyStatus(policyNumber: string, userId: string): Promise<DCCPPolicyStatusResult> {
    logger.info('[DCCP] getPolicyStatus called', { policyNumber, userId })

    // TODO: Implement
    return {
      policyNumber,
      status: 'DRAFT',
      errorMessage: 'Portal automation not yet implemented — credentials pending',
    }
  }

  // ----------------------------------------------------------
  // Commission report
  // ----------------------------------------------------------

  /**
   * Retrieve the monthly commission report from the DCCP portal.
   *
   * @param month   Format: "2026-04"
   * @param userId  The user whose portal session will be used
   *
   * Cut-off: 5th of each month. Report covers 1st–31st of previous month.
   * Payment: before the 15th.
   *
   * TODO: Navigate to the commission/reports section in COLMS,
   * filter by month, scrape or download the table.
   */
  async getCommissionReport(month: string, userId: string): Promise<DCCPMonthlyCommissionReport> {
    logger.info('[DCCP] getCommissionReport called', { month, userId })

    // TODO: Implement
    return {
      month,
      totalPolicies: 0,
      cliPolicies: 0,
      aipPolicies: 0,
      funeralPolicies: 0,
      totalPremium: 0,
      totalFee: 0,
      isPaid: false,
    }
  }

  // ----------------------------------------------------------
  // Connection test
  // ----------------------------------------------------------

  /**
   * Test that a user's credentials can successfully log in to the DCCP portal.
   * Used in the Account Settings UI to validate before saving.
   *
   * @param credentials  Credentials to test (may not be saved yet)
   */
  async testConnection(credentials: DCCPCredentials): Promise<{ success: boolean; message: string }> {
    logger.info('[DCCP] testConnection called', { username: credentials.username })

    try {
      // TODO: Implement once portal is accessible
      // const { browser } = await this.loginAs(credentials)
      // await (browser as any).close()
      // return { success: true, message: 'Login successful' }

      return {
        success: false,
        message: 'Connection test not yet available — portal automation is pending. Your credentials will be saved and used once automation is activated.',
      }
    } catch (error: unknown) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      }
    }
  }
}

// Export a default instance (stateless — credentials always passed explicitly)
export const dccpService = new DCCPService()
