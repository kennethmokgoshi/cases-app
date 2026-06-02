const fs = require('fs');
const path = require('path');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    if (!content.includes('alert(') && !content.includes('window.alert(') && 
        !content.includes('confirm(') && !content.includes('window.confirm(')) {
        return;
    }

    content = content.replace(/window\.alert\(/g, 'alert(');
    content = content.replace(/window\.confirm\(/g, 'confirm(');

    // Replace specific alert strings with success
    content = content.replace(/alert\(([^)]*successfully[^)]*)\)/gi, 'toast.success($1)');
    content = content.replace(/alert\(([^)]*created[^)]*)\)/gi, 'toast.success($1)');
    content = content.replace(/alert\(([^)]*saved[^)]*)\)/gi, 'toast.success($1)');
    content = content.replace(/alert\(([^)]*copied[^)]*)\)/gi, 'toast.success($1)');
    
    // Replace all other alerts with toast.error (a safe default, as many alerts are for errors)
    content = content.replace(/alert\(/g, 'toast.error(');

    // Replace confirm with await confirm
    content = content.replace(/!confirm\(/g, '!await confirm(');
    content = content.replace(/(?<!await )confirm\(/g, 'await confirm(');

    if (content !== original) {
        const needsToast = content.includes('toast.');
        const needsConfirm = content.includes('await confirm(');
        
        let importsToAdd = [];
        if (needsToast) importsToAdd.push('toast');
        if (needsConfirm) importsToAdd.push('confirm');
        
        if (importsToAdd.length > 0) {
            const importLine = `import { ${importsToAdd.join(', ')} } from '@zenowethu/ui';\n`;
            
            // Find first line that is not a comment or 'use client'
            let lines = content.split('\n');
            let insertIdx = 0;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line === "'use client';" || line === '"use client";') {
                    insertIdx = i + 1;
                    break;
                }
            }
            lines.splice(insertIdx, 0, importLine);
            content = lines.join('\n');
        }
        
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Processed', filePath);
    }
}

function walk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory() && !file.includes('node_modules') && !file.includes('.next')) { 
            results = results.concat(walk(file));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const files = [...walk(path.join(__dirname, '../apps')), ...walk(path.join(__dirname, '../packages'))];
files.forEach(processFile);
