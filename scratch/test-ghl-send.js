const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

async function testGhlSendMessage() {
    const apiKey = 'pit-b0246501-45f7-41f3-b358-f805b9c88e85';
    const locationId = 'MPw0uzYVWwFySKOHTHXz';
    const contactId = 'vcYn6IhviZmurlSoOWpX'; // Found ID for user

    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Version': GHL_API_VERSION,
    };

    console.log('Testing GHL Send Message (WhatsApp)...');
    const body = {
        type: 'WhatsApp',
        contactId,
        message: 'Hello! This is a test message from Zenowethu to verify your WhatsApp integration. Please ignore.'
    };

    try {
        const res = await fetch(`${GHL_BASE_URL}/conversations/messages`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        console.log('Send Status:', res.status);
        const data = await res.json();
        console.log('Send Result:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Fetch Error:', e);
    }
}

testGhlSendMessage();
