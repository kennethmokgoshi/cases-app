import ConsentClient from "./ConsentClient";

/**
 * Debt-review-removal consent page. Signed-in consumers are verified through
 * Credo; signed-out consumers verify the link by typing their SA ID number.
 */
export default async function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ConsentClient token={token} />;
}
