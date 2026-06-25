import { Suspense } from "react";
import OtpPageClient from "./otp-client";

export const dynamic = "force-dynamic";

export default function OtpPage() {
  return (
    <Suspense fallback={null}>
      <OtpPageClient />
    </Suspense>
  );
}
