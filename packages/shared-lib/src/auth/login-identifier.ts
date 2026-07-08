export function normalizeLoginIdentifier(identifier: string): string {
    return identifier.trim().toLowerCase();
}

export function buildUserLoginLookup(identifier: string) {
    const normalized = normalizeLoginIdentifier(identifier);
    return {
        OR: [
            { email: normalized },
            { username: normalized },
        ],
    };
}
