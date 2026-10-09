import { LandingNav } from "../../components/LandingNav";
import { AssessmentForm } from "../../components/AssessmentForm";
import { getSiteCompany } from "../../lib/company";

export default async function Assessment() {
  const company = await getSiteCompany();
  return <AssessmentForm company={company} nav={<LandingNav />} />;
}
