import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zenowethu/database";
import { auth } from "@/auth";
import { createLogger } from "@zenowethu/shared-lib";
import { recordDrrConsent, DRR_CONSENT_TEXT } from "@zenowethu/shared-lib/src/dhs/consent-service";

const logger = createLogger("credo/api/consumer/consent");

/**
 * GET  /api/consumer/consent/[token]  — login-gated; consent details for the page.
 * POST /api/consumer/consent/[token]  — login-gated; approve the consent.
 *
 * Unlike the public Cases consent link, this route requires the consumer to be
 * signed in to Credo (username = 13-digit SA ID number). Ownership is enforced:
 * the consent must belong to this consumer's profile, or to a client with the
 * same ID number (in which case the profile is linked on first view).
 */

type ConsentWithRelations = NonNullable<Awaited<ReturnType<typeof loadConsent>>>;

// Single shape (not a discriminated union): this app compiles with strict:false,
// under which TS does not narrow union discriminants reliably.
interface Ownership {
    consent: ConsentWithRelations | null;
    error?: string;
    status?: number;
}

function loadConsent(token: string) {
    return prisma.debtReviewRemovalConsent.findUnique({
        where: { token },
        include: {
            case: { select: { id: true, fileNumber: true } },
            client: { select: { firstName: true, idNumber: true } },
        },
    });
}

async function resolveOwnership(token: string, consumerId: string): Promise<Ownership> {
    const consent = await loadConsent(token);
    if (!consent) return { consent: null, error: "This consent link is not valid.", status: 404 };

    if (consent.consumerId && consent.consumerId === consumerId) return { consent };

    // Match by ID number — the canonical Credo identity — and link the profile.
    const consumer = await prisma.consumerAccount.findUnique({
        where: { id: consumerId },
        select: { idNumber: true },
    });
    const matchesById =
        typeof consumer?.idNumber === "string" &&
        consumer.idNumber.length > 0 &&
        consumer.idNumber === consent.client?.idNumber;

    if (!matchesById && consent.consumerId) {
        return { consent: null, error: "This consent request belongs to a different Credo profile.", status: 403 };
    }
    if (!matchesById) {
        return {
            consent: null,
            error: "This consent request is not linked to your profile. Please contact us on 081 747 7616 if you believe this is a mistake.",
            status: 403,
        };
    }

    if (!consent.consumerId) {
        await prisma.debtReviewRemovalConsent
            .update({ where: { id: consent.id }, data: { consumerId } })
            .catch(() => null);
    }
    return { consent };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { token } = await params;
        const ownership = await resolveOwnership(token, session.user.id);
        if (!ownership.consent) {
            return NextResponse.json({ error: ownership.error ?? "Unable to verify this consent link." }, { status: ownership.status ?? 400 });
        }

        const c = ownership.consent;
        return NextResponse.json({
            token: c.token,
            status: c.status,
            expired: c.expiresAt < new Date(),
            consumerFirstName: c.client?.firstName ?? null,
            fileNumber: c.case?.fileNumber ?? null,
            consentText: c.status === "PENDING" ? DRR_CONSENT_TEXT : c.consentText ?? DRR_CONSENT_TEXT,
            consentedAt: c.consentedAt,
        });
    } catch (error) {
        logger.error("[CREDO_CONSENT] GET error", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { token } = await params;
        const ownership = await resolveOwnership(token, session.user.id);
        if (!ownership.consent) {
            return NextResponse.json({ error: ownership.error ?? "Unable to verify this consent link." }, { status: ownership.status ?? 400 });
        }

        const ipAddress =
            request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
        const userAgent = request.headers.get("user-agent") || "unknown";

        const result = await recordDrrConsent({ token, ipAddress, userAgent, consumerId: session.user.id });
        if (!result.ok) {
            return NextResponse.json({ error: result.error ?? "Unable to record consent." }, { status: result.status ?? 400 });
        }

        logger.info("[CREDO_CONSENT] Consent recorded", {
            token: token.slice(0, 8) + "…",
            alreadyConsented: result.alreadyConsented,
        });

        // Kick off the document readiness pipeline in the Cases app (it needs the
        // case files on ITS disk). Fire-and-forget — the consumer's confirmation
        // must not wait for AI document splitting.
        if (!result.alreadyConsented && result.caseId) {
            triggerCasesReadiness(result.caseId);
        }

        return NextResponse.json({
            success: true,
            alreadyConsented: result.alreadyConsented,
            message:
                "Thank you. Your approval has been recorded and Zenowethu Debt Management is confirmed as the team authorised to continue working on your file.",
        });
    } catch (error) {
        logger.error("[CREDO_CONSENT] POST error", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

/** Fire-and-forget call to the Cases app's internal readiness endpoint. */
function triggerCasesReadiness(caseId: string): void {
    const base = (process.env.CASES_APP_URL || "https://app.zenowethu.co.za").replace(/\/+$/, "");
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) {
        logger.warn(
            `[CREDO_CONSENT] INTERNAL_API_SECRET is not set — cannot trigger the document readiness check for case ${caseId}. ` +
            `Staff can run it from the case, or it will run when Manage Consumers is next used.`,
        );
        return;
    }
    void fetch(`${base}/api/internal/drr-readiness`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": secret },
        body: JSON.stringify({ caseId }),
    })
        .then((res) => {
            if (!res.ok) logger.error(`[CREDO_CONSENT] Readiness trigger for case ${caseId} returned ${res.status}`);
        })
        .catch((err) => logger.error(`[CREDO_CONSENT] Readiness trigger failed for case ${caseId}:`, err));
}
