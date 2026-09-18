import ConsentClient from "./ConsentClient";
import { getCompanyProfile } from "@zenowethu/shared-lib/src/company/company-profile-service";

/**
 * Debt-review-removal consent page. Signed-in consumers are verified through
 * Credo; signed-out consumers verify the link by typing their SA ID number.
 *
 * The firm shown in the header and used for support links comes from the
 * tenant's company profile, resolved server-side.
 */
export default async function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const company = await getCompanyProfile();
  return (
    <ConsentClient
      token={token}
      firm={{
        name: company.tradingName,
        shortName: company.shortName,
        ncrdc: company.ncrdcNumber,
        phone: company.phone,
        email: company.email,
      }}
    />
  );
}
