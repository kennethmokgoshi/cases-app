const http = require('http');

async function checkApi() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/cases/cmnp3m1fl00007khtkwshv7em',
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: 'Failed to parse JSON', status: res.statusCode, data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.end();
  });
}

checkApi().then(data => {
  console.log('API RESPONSE:', JSON.stringify(data, null, 2));
}).catch(console.error);
