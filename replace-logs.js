const fs = require('fs');
const path = require('path');

const IGNORE_DIRS = ['node_modules', '.next', 'dist', 'build', '.git'];
const EXTENSIONS = ['.ts', '.tsx'];

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            if (!IGNORE_DIRS.includes(file)) {
                processDirectory(fullPath);
            }
        } else if (EXTENSIONS.includes(path.extname(fullPath))) {
            processFile(fullPath);
        }
    }
}

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if the file contains console.log/error/warn
    if (!/console\.(log|error|warn)/.test(content)) return;
    
    // Check if it already imports logger
    if (content.includes("from '@zenowethu/shared-lib'")) {
        if (!content.includes('logger')) {
            content = content.replace(/from '@zenowethu\/shared-lib';/, "logger, $&"); // Simplistic approach to existing imports
            if (!content.includes('logger')) {
                 // If that regex trick didn't work (e.g. because of spacing), add a new import 
                 content = `import { logger } from '@zenowethu/shared-lib';\n` + content;
            }
        }
    } else {
        // Add import after the last import statement, or at the top
        const lastImportMatch = [...content.matchAll(/^import .* from .*;/gm)].pop();
        if (lastImportMatch) {
            const index = lastImportMatch.index + lastImportMatch[0].length;
            content = content.slice(0, index) + `\nimport { logger } from '@zenowethu/shared-lib';` + content.slice(index);
        } else {
            content = `import { logger } from '@zenowethu/shared-lib';\n` + content;
        }
    }
    
    // Replace all occurrences
    content = content.replace(/console\.log/g, 'logger.info');
    content = content.replace(/console\.error/g, 'logger.error');
    content = content.replace(/console\.warn/g, 'logger.warn');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
}

processDirectory(path.join(__dirname, 'apps'));
processDirectory(path.join(__dirname, 'packages'));
console.log('Done!');
