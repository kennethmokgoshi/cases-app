'use strict';
/**
 * Codemod: replace alert() with toast.success / toast.error / toast
 *
 * - Classifies each alert by message content
 * - Replaces alert(msg) → toast.success/error/neutral(msg)
 * - Adds `import { toast } from '@zenowethu/ui'` to each modified file
 *   (or merges into an existing @zenowethu/ui import on the same line)
 *
 * Run from repo root:
 *   node scripts/fix-alerts.cjs
 */

const fs   = require('fs');
const path = require('path');

const APPS_DIR = path.join(__dirname, '..', 'apps');

// ── Classification helpers ────────────────────────────────────────────────

const SUCCESS_KEYWORDS = [
    'successfully', 'success!', ' copied', 'generated', 'issued',
    'shrunk', 'part 1 uploaded', 'converted', 'letter(s)', 'posted',
    'sent successfully', 'uploaded successfully', 'deleted successfully',
    'created successfully', 'saved successfully', 'split in half',
];

const ERROR_KEYWORDS = [
    'fail', 'error', '❌', 'please ', 'invalid', 'connection error',
    'not found', 'try again', 'unable', 'select at least', 'fill in',
    'provide a', 'enter a', 'enter the', 'missing', 'no cases',
    'at least one', 'required',
];

function classify(content) {
    const lower = content.toLowerCase();
    if (ERROR_KEYWORDS.some(k => lower.includes(k))) return 'error';
    if (SUCCESS_KEYWORDS.some(k => lower.includes(k))) return 'success';
    return 'neutral';
}

// ── File walk ─────────────────────────────────────────────────────────────

function getFiles(dir, results = []) {
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir)) {
        if (['node_modules', '.next', 'dist', '.git', '.turbo'].includes(entry)) continue;
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) getFiles(full, results);
        else if (['.tsx', '.ts'].includes(path.extname(entry)) && !entry.includes('.test.')) {
            results.push(full);
        }
    }
    return results;
}

// ── Import injection ──────────────────────────────────────────────────────

function addToastImport(content) {
    // Already has toast imported — nothing to do
    if (/import[^;]*\btoast\b[^;]*from/.test(content)) return content;

    // Merge into an existing single-line @zenowethu/ui import
    const uiImport = /^(import \{)([^}]+)(\} from ['"]@zenowethu\/ui['"])/m;
    if (uiImport.test(content)) {
        return content.replace(uiImport, (_, open, imports, close) => {
            if (imports.includes('toast')) return _;
            return `${open}${imports.trimEnd()}, toast${close}`;
        });
    }

    // Add a new import line
    const useClientRe = /^(['"]use client['"];?\r?\n)/;
    if (useClientRe.test(content)) {
        return content.replace(useClientRe, `$1import { toast } from '@zenowethu/ui';\n`);
    }

    // After the last top-level import statement
    const lines  = content.split('\n');
    let lastIdx  = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^import /.test(lines[i])) lastIdx = i;
    }
    if (lastIdx >= 0) {
        lines.splice(lastIdx + 1, 0, `import { toast } from '@zenowethu/ui';`);
        return lines.join('\n');
    }

    return `import { toast } from '@zenowethu/ui';\n` + content;
}

// ── Main ──────────────────────────────────────────────────────────────────

let totalFiles = 0;
let totalReplaced = 0;

for (const filePath of getFiles(APPS_DIR)) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('alert(')) continue;

    let count = 0;

    // Replace every alert(...); on a single line.
    // Non-greedy (.*?) means we stop at the first ); — which in valid JS can
    // only be the real closing paren because ); never appears inside a string
    // literal in this codebase (checked via grep).
    const modified = content.replace(/\balert\((.*?)\);/g, (_, arg) => {
        count++;
        const type = classify(arg);
        const fn   = type === 'success' ? 'toast.success'
                   : type === 'error'   ? 'toast.error'
                   :                      'toast';
        return `${fn}(${arg});`;
    });

    if (count === 0) continue;

    const withImport = addToastImport(modified);

    fs.writeFileSync(filePath, withImport, 'utf8');
    totalFiles++;
    totalReplaced += count;

    const rel = path.relative(APPS_DIR, filePath);
    console.log(`  ✓ ${rel}  (${count})`);
}

console.log(`\nDone: ${totalReplaced} alert() replaced across ${totalFiles} files.\n`);
