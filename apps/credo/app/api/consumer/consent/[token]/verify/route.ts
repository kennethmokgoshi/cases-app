import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createLogger } from "@zenowethu/shared-lib";
import { verifyDrrConsentIdentity } from "@zenowethu/shared-lib/src/dhs/consent-service";

const logger = createLogger("credo/api/consumer/consent/verify");

const VerifyIdentitySchema = z.object({
    idNumber: z.string().trim().regex(/^\d{13}$/, "Enter a valid 13-digit SA ID number."),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    try {
        const { token } = await params;
        const parsed = VerifyIdentitySchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json({ error: "Enter a valid 13-digit SA ID number." }, { status: 400 });
        }

        const verification = await verifyDrrConsentIdentity({ token, idNumber: parsed.data.idNumber });
        if (!verification.ok || !verification.view) {
            return NextResponse.json(
                { error: verification.error ?? "Unable to verify this consent link." },
                { status: verification.status ?? 400 },
            );
        }

        return NextResponse.json(verification.view);
    } catch (error) {
        logger.error("[CREDO_CONSENT] Verify error", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
