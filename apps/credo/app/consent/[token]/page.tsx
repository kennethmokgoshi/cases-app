import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ConsentClient from "./ConsentClient";

/**
 * Login-gated debt-review-removal consent page. The consumer arrives here from
 * the acceptance email; if they are not signed in they are sent to the Credo
 * login (username = 13-digit SA ID number) and brought straight back.
 */
export default async function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/consent/${token}`)}`);
  }
  return <ConsentClient token={token} />;
}
