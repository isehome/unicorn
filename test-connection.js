const https = require('https');

const options = {
    hostname: '192.168.1.1',
    port: 443,
    path: '/proxy/network/integration/v1/sites',
    method: 'GET',
    rejectUnauthorized: false,
    headers: {
        'X-API-KEY': 'ZsfR-ssJQqIOnQjL5d66hZiNdcMyCPGC',
        'Accept': 'application/json'
    },
    timeout: 5000 // 5 seconds
};

console.log('Testing connection to https://192.168.1.1...');

const req = https.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.on('data', (d) => {
        process.stdout.write(d);
    });
});

req.on('error', (e) => {
    console.error(`PROBLEM: ${e.message}`);
});

req.on('timeout', () => {
    req.destroy();
    console.error('TIMEOUT: Connection timed out');
});

req.end();
