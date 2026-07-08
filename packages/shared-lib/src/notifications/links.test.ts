import { afterEach, describe, expect, it } from 'vitest';

import { buildProjectUrl, getCasesAppBaseUrl } from './links';

describe('notification links', () => {
    afterEach(() => {
        delete process.env.NEXT_PUBLIC_APP_URL;
        delete process.env.NEXTAUTH_URL;
        delete process.env.APP_URL;
    });

    it('builds project links from NEXT_PUBLIC_APP_URL', () => {
        process.env.NEXT_PUBLIC_APP_URL = 'https://cases.test/';

        expect(getCasesAppBaseUrl()).toBe('https://cases.test');
        expect(buildProjectUrl('project 1')).toBe('https://cases.test/projects?id=project%201');
    });

    it('falls back to the live Cases domain when no app URL is configured', () => {
        expect(buildProjectUrl('proj-123')).toBe('https://cases.zenowethu.co.za/projects?id=proj-123');
    });
});
