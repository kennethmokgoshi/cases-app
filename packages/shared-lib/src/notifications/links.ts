const DEFAULT_CASES_APP_URL = 'https://cases.zenowethu.co.za';

export function getCasesAppBaseUrl(): string {
    return (
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXTAUTH_URL ||
        process.env.APP_URL ||
        DEFAULT_CASES_APP_URL
    ).replace(/\/$/, '');
}

export function buildProjectUrl(projectId: string): string {
    return `${getCasesAppBaseUrl()}/projects?id=${encodeURIComponent(projectId)}`;
}
