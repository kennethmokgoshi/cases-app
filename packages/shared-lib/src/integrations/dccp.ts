import { logger } from '../logger'
import { getDCCPCredentials } from './dccp-config'
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
// All methods are stubbed and ready to be filled in once login
// credentials are received from DC Credit Protect.
//
// To implement: map each method to the portal's form fields
// using the demo environment first (demo.pontis.co.za/arsys).
// ============================================================

export class DCCPService {
  // ----------------------------------------------------------
  // Session management
  // ----------------------------------------------------------

  /**
   * Launch a Puppeteer browser and log in to the DCCP portal.
   * Returns a browser/page pair to be used by other methods.
   *
   * TODO: Fill in once credentials are received.
   * Steps:
   *   1. Navigate to portalUrl
   *   2. Find username/password fields, fill and submit
   *   3. Wait for dashboard to confirm login
   *   4. Return { browser, page }
   */
  async login(): Promise<{ browser: unknown; page: unknown }> {
    const credentials = await getDCCPCredentials()

    if (!credentials.username || !credentials.password) {
      throw new Error(
        '[DCCP] Credentials not configured. Set DCCP_USERNAME and DCCP_PASSWORD in .env or add a DCCPCredential record in the database.',
      )
    }

    logger.info('[DCCP] Login stub called — awaiting credentials to implement')

    // TODO: Implement when credentials received
    // const puppeteer = await import('puppeteer')
    // const browser = await puppeteer.launch({ headless: true })
    // const page = await browser.newPage()
    // await page.goto(credentials.portalUrl)
    // await page.type('#username', credentials.username)
    // await page.type('#password', credentials.password)
    // await page.click('[type="submit"]')
    // await page.waitForNavigation()
    // return { browser, page }

    throw new Error('[DCCP] Login not yet implemented — credentials pending')
  }

  // ----------------------------------------------------------
  // Policy capture
  // ----------------------------------------------------------

  /**
   * Submit a Credit Life Insurance policy to the DCCP portal.
   *
   * TODO: Map these fields to the portal form once credentials received.
   * Data available in input:
   *   - client: firstName, lastName, idNumber, dob, email, phone, address
   *   - banking: bankName, accountNumber, accountType, debitOrderDate
   *   - creditAccounts[]: creditProvider, accountType, outstandingBalance, newPremium
   *   - previousInsurance?: for waiting period waiver
   *   - inceptionDate
   */
  async captureCliPolicy(input: DCCPCliPolicyInput): Promise<DCCPSubmissionResult> {
    logger.info('[DCCP] captureCliPolicy stub called', {
      client: `${input.client.firstName} ${input.client.lastName}`,
      accounts: input.creditAccounts.length,
    })

    // TODO: Implement when credentials received
    // const { browser, page } = await this.login()
    // try {
    //   await page.goto(`${portalUrl}/new-cli-policy`)
    //   // ... fill form fields ...
    //   const policyNumber = await page.$eval('#policy-number', el => el.textContent)
    //   return { success: true, policyNumber }
    // } finally {
    //   await browser.close()
    // }

    return { success: false, errorMessage: 'Not yet implemented — credentials pending' }
  }

  /**
   * Submit an Assistance Income Protector policy to the DCCP portal.
   *
   * TODO: Map these fields to the portal form once credentials received.
   * Data available in input:
   *   - client: all personal details
   *   - banking: debit order details
   *   - monthlyBenefit: 5000 | 10000 | 15000
   *   - employerName, employedSince
   *   - inceptionDate
   */
  async captureAipPolicy(input: DCCPAipPolicyInput): Promise<DCCPSubmissionResult> {
    logger.info('[DCCP] captureAipPolicy stub called', {
      client: `${input.client.firstName} ${input.client.lastName}`,
      monthlyBenefit: input.monthlyBenefit,
    })

    // TODO: Implement when credentials received

    return { success: false, errorMessage: 'Not yet implemented — credentials pending' }
  }

  /**
   * Submit a Funeral Cover policy to the DCCP portal.
   *
   * TODO: Map these fields to the portal form once credentials received.
   * Data available in input:
   *   - client: all personal details
   *   - banking: debit order details
   *   - funeralCoverType: INDIVIDUAL | FAMILY
   *   - coverAmount: 10000 | 20000 | 30000
   *   - dependants[]: for FAMILY cover
   *   - beneficiaryName, beneficiaryRelationship
   *   - inceptionDate
   */
  async captureFuneralPolicy(input: DCCPFuneralPolicyInput): Promise<DCCPSubmissionResult> {
    logger.info('[DCCP] captureFuneralPolicy stub called', {
      client: `${input.client.firstName} ${input.client.lastName}`,
      coverType: input.funeralCoverType,
      coverAmount: input.coverAmount,
    })

    // TODO: Implement when credentials received

    return { success: false, errorMessage: 'Not yet implemented — credentials pending' }
  }

  /**
   * Submit any policy type — dispatches to the correct method.
   */
  async capturePolicy(input: DCCPPolicyInput): Promise<DCCPSubmissionResult> {
    switch (input.policyType) {
      case 'CLI':
        return this.captureCliPolicy(input)
      case 'AIP':
        return this.captureAipPolicy(input)
      case 'FUNERAL':
        return this.captureFuneralPolicy(input)
      default: {
        const _exhaustive: never = input
        throw new Error(`Unknown policy type: ${JSON.stringify(_exhaustive)}`)
      }
    }
  }

  // ----------------------------------------------------------
  // Policy status
  // ----------------------------------------------------------

  /**
   * Check the status of a policy on the DCCP portal.
   *
   * TODO: Navigate to policy search, look up by policy number.
   */
  async getPolicyStatus(policyNumber: string): Promise<DCCPPolicyStatusResult> {
    logger.info('[DCCP] getPolicyStatus stub called', { policyNumber })

    // TODO: Implement when credentials received

    return {
      policyNumber,
      status: 'DRAFT',
      errorMessage: 'Not yet implemented — credentials pending',
    }
  }

  // ----------------------------------------------------------
  // Commission reports
  // ----------------------------------------------------------

  /**
   * Pull the monthly commission report from the DCCP portal.
   * @param month  Format: "2026-04"
   *
   * TODO: Navigate to commission/reports section, download or scrape the table.
   * Cut-off is the 5th of each month; report covers 1st–31st of previous month.
   */
  async getCommissionReport(month: string): Promise<DCCPMonthlyCommissionReport> {
    logger.info('[DCCP] getCommissionReport stub called', { month })

    // TODO: Implement when credentials received

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
}

// Singleton instance
export const dccpService = new DCCPService()
