
import fs from 'fs';

const content = fs.readFileSync('apps/cases/app/(authenticated)/cases/[id]/SendQuoteModal.tsx', 'utf8');

const cleanContent = content.replace(/<['A-Z][^>]*>/g, ' ');

function findMismatches(text) {
    const stack = [];
    const tags = text.match(/<\/?[a-zA-Z][^>]*\/?>/g) || [];
    
    // Find line numbers for each tag
    let lastPos = 0;
    const lines = text.split('\n');

    for (const tag of tags) {
        if (tag.endsWith('/>')) continue;
        
        // Find line number
        let lineNum = -1;
        for (let i = lastPos; i < lines.length; i++) {
            if (lines[i].includes(tag)) {
                lineNum = i + 1;
                lastPos = i;
                break;
            }
        }

        if (tag.startsWith('</')) {
            const tagName = tag.match(/<\/([^\s>]+)/)[1];
            if (stack.length === 0) {
                console.log(`Extra closing tag: ${tag} at L${lineNum}`);
            } else {
                const last = stack.pop();
                if (last.name !== tagName) {
                    console.log(`Mismatched closing tag: expected </${last.name}> (from L${last.line}), found ${tag} at L${lineNum}`);
                }
            }
        } else {
            const tagNameMatch = tag.match(/<([^\s>]+)/);
            if (tagNameMatch) {
                const tagName = tagNameMatch[1];
                if (!['img', 'br', 'input', 'hr', 'textarea'].includes(tagName)) {
                    stack.push({ name: tagName, line: lineNum });
                }
            }
        }
    }
    console.log('Unclosed tags:', stack);
}

findMismatches(cleanContent);
