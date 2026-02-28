const fs = require('fs');
const path = require('path');

const apps = ['finance', 'forensic-audit', 'insurance', 'legal'];
const casesApiDir = path.join(__dirname, 'apps/cases/app/api');

// Find all .ts files in the cases API dir
function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            getAllFiles(fullPath, fileList);
        } else if (fullPath.endsWith('.ts')) {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

const casesFiles = getAllFiles(casesApiDir);

for (const casesFile of casesFiles) {
    const relativePath = path.relative(casesApiDir, casesFile);
    const casesContent = fs.readFileSync(casesFile, 'utf8');

    // Extract parseBody usages and schemas from cases file
    const parseBodyMatches = [...casesContent.matchAll(/const [a-zA-Z0-9_]+ = parseBody\(([a-zA-Z0-9_Schema]+),\s*await\s+(?:req|request)\.json\(\)\);/g)];
    const importMatch = casesContent.match(/import\s+{([^}]+)}\s+from\s+['"]@\/lib\/schemas['"]/);

    if (parseBodyMatches.length === 0 || !importMatch) continue;

    // Convert cases local import to shared-lib import
    const schemasToImport = importMatch[1].trim();

    for (const targetApp of apps) {
        const targetFile = path.join(__dirname, `apps/${targetApp}/app/api`, relativePath);
        if (!fs.existsSync(targetFile)) continue;

        let targetContent = fs.readFileSync(targetFile, 'utf8');
        let modified = false;

        // Add the shared-lib schemas import if not present
        if (!targetContent.includes(`from '@zenowethu/shared-lib'`)) {
            const firstImport = targetContent.indexOf('import ');
            targetContent = targetContent.substring(0, firstImport) + `import { ${schemasToImport} } from '@zenowethu/shared-lib';\n` + targetContent.substring(firstImport);
            modified = true;
        } else if (!targetContent.includes('parseBody')) {
            // Append to existing shared-lib import
            targetContent = targetContent.replace(/from\s+['"]@zenowethu\/shared-lib['"]/, `, ${schemasToImport} $&`);
            modified = true;
        }

        // Replace the raw JSON parsing with parseBody for each match
        for (const match of parseBodyMatches) {
            const schemaName = match[1];
            // Look for generic const body = await request.json();
            const rawRegex1 = /const\s+([a-zA-Z0-9_]+)\s*=\s*await\s+(?:req|request)\.json\(\);/;
            const targetRawMatch = targetContent.match(rawRegex1);

            if (targetRawMatch) {
                const varName = targetRawMatch[1];
                const replacement = `const parsed = parseBody(${schemaName}, await request.json());\n        if (!parsed.success) return parsed.response;\n        const ${varName} = parsed.data;`;
                targetContent = targetContent.replace(rawRegex1, replacement);
                modified = true;
            } else {
                // Look for destructured const { foo, bar } = await request.json();
                const rawRegex2 = /const\s+({[^}]+})\s*=\s*await\s+(?:req|request)\.json\(\);/;
                const targetRawMatch2 = targetContent.match(rawRegex2);
                if (targetRawMatch2) {
                    const destructured = targetRawMatch2[1];
                    const replacement = `const parsed = parseBody(${schemaName}, await request.json());\n        if (!parsed.success) return parsed.response;\n        const ${destructured} = parsed.data;`;
                    targetContent = targetContent.replace(rawRegex2, replacement);
                    modified = true;
                }
            }
        }

        if (modified) {
            fs.writeFileSync(targetFile, targetContent, 'utf8');
            console.log(`Updated ${targetApp} -> ${relativePath}`);
        }
    }
}
console.log('Codemod complete.');
