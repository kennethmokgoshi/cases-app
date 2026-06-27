const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

async function testGhl() {
    const apiKey = 'pit-b0246501-45f7-41f3-b358-f805b9c88e85';
    const locationId = 'MPw0uzYVWwFySKOHTHXz';
    const to = '+27817477616';

    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Version': GHL_API_VERSION,
    };

    console.log('Testing GHL Contact Lookup with query parameter...');
    const searchUrl = `${GHL_BASE_URL}/contacts/?locationId=${locationId}&query=${encodeURIComponent(to)}`;
    console.log('URL:', searchUrl);

    try {
        const searchRes = await fetch(searchUrl, { headers });
        console.log('Search Status:', searchRes.status);
        const searchData = await searchRes.json();
        console.log('Search Result:', JSON.stringify(searchData, null, 2));
    } catch (e) {
        console.error('Fetch Error:', e);
    }
}

testGhl();
