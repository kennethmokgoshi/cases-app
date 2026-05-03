const { execSync } = require('child_process');
const crypto = require('crypto');

async function run() {
    const DOKPLOY_URL = process.env.DOKPLOY_URL;
    const DOKPLOY_TOKEN = process.env.DOKPLOY_TOKEN;
    const DOKPLOY_PROJECT_ID = process.env.DOKPLOY_PROJECT_ID;

    if (!DOKPLOY_URL || !DOKPLOY_TOKEN || !DOKPLOY_PROJECT_ID) {
        console.error('❌ Missing environment variables: DOKPLOY_URL, DOKPLOY_TOKEN, or DOKPLOY_PROJECT_ID');
        process.exit(1);
    }

    const CRON_SECRET = `zeno_sync_${crypto.randomBytes(8).toString('hex')}`;
    console.log(`🚀 Generated CRON_SECRET: ${CRON_SECRET}`);
    console.log(`⚠️  SAVE THIS: Add this to your GitHub Secrets as CRON_SECRET`);

    const API = `${DOKPLOY_URL.replace(/\/$/, '')}/api`;
    const CASES_APP_NAME = "cases-app-vtwo";

    try {
        const HEADERS = {
            'x-api-key': DOKPLOY_TOKEN,
            'Content-Type': 'application/json'
        };

        console.log('▶  Fetching projects...');
        const listResponse = execSync(`curl -s -H "x-api-key: ${DOKPLOY_TOKEN}" "${API}/project.all"`).toString();
        let projects = JSON.parse(listResponse);
        
        if (projects.data && Array.isArray(projects.data)) projects = projects.data;
        if (!Array.isArray(projects)) {
            console.error('❌ Error: projects is not an array.');
            process.exit(1);
        }
        
        // Find the application by searching through all projects and environments
        let APP_ID = null;
        for (const project of projects) {
            for (const env of (project.environments || [])) {
                const foundApp = (env.applications || []).find(a => a.name === CASES_APP_NAME);
                if (foundApp) {
                    APP_ID = foundApp.applicationId || foundApp.id;
                    break;
                }
            }
            if (APP_ID) break;
        }

        if (!APP_ID) {
            console.error(`❌ Could not find application with name '${CASES_APP_NAME}' in any project.`);
            process.exit(1);
        }
        console.log(`✅ Found Cases App ID: ${APP_ID}`);

        console.log('▶  Fetching current environment...');
        const oneResponse = execSync(`curl -s -H "x-api-key: ${DOKPLOY_TOKEN}" "${API}/application.one?applicationId=${APP_ID}"`).toString();
        const app = JSON.parse(oneResponse);
        
        const currentEnv = app.env || "";
        const newEnv = currentEnv.includes('CRON_SECRET=') 
            ? currentEnv.replace(/CRON_SECRET=.*/, `CRON_SECRET=${CRON_SECRET}`)
            : `${currentEnv}\nCRON_SECRET=${CRON_SECRET}`;

        console.log('▶  Updating environment variables...');
        const saveBody = JSON.stringify({
            applicationId: APP_ID,
            env: newEnv
        });

        execSync(`curl -s -X POST -H "x-api-key: ${DOKPLOY_TOKEN}" -H "Content-Type: application/json" -d '${saveBody.replace(/'/g, "'\\''")}' "${API}/application.saveEnvironment"`);
        console.log('✅ Environment updated.');

        console.log(`▶  Triggering deployment for ${CASES_APP_NAME}...`);
        execSync(`curl -s -X POST -H "x-api-key: ${DOKPLOY_TOKEN}" -H "Content-Type: application/json" -d '{"applicationId": "${APP_ID}"}' "${API}/application.deploy"`);
        console.log('✅ Deployment triggered.');

        console.log('\n════════════════════════════════════════════════════════════════');
        console.log('  SUCCESS! Your integration is being deployed.');
        console.log('  FINAL STEP: Go to GitHub and add the CRON_SECRET to your secrets.');
        console.log('════════════════════════════════════════════════════════════════');

    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

run();
