import { CaseDetailContent } from './CaseDetailContent';

export default async function B2BCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    return <CaseDetailContent caseId={id} />;
}
