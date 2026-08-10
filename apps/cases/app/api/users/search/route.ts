import { createMentionSearchRoute } from '@zenowethu/shared-lib/src/search/mention-search-route';

// GET - @mention autocomplete suggestions (users + groups)
export const { GET } = createMentionSearchRoute();
