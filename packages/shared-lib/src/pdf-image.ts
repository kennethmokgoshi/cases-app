
// IMPORTANT: This module uses Node.js fs/path APIs and can only run in Node.js runtime
// Do NOT import from barrel export - import directly:
// import { convertPdfToImages } from '@zenowethu/shared-lib/pdf-image'

import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { logger } from './logger';

// Load PDF.js source from local public directory (avoids CDN dependency in server environments)
let _pdfJsSource: string | null = null;
let _pdfJsWorkerSource: string | null = null;

function getPdfJsSource(): string {
    if (_pdfJsSource === null) {
        // Lazy import to avoid Edge Runtime crashes
        const { readFileSync } = require('fs') as typeof import('fs');
        const { join } = require('path') as typeof import('path');

        const filePath = join(process.cwd(), 'public', 'pdfjs', 'pdf.min.js');
        _pdfJsSource = readFileSync(filePath, 'utf-8');
    }
    return _pdfJsSource;
}

function getPdfJsWorkerSource(): string {
    if (_pdfJsWorkerSource === null) {
        // Lazy import to avoid Edge Runtime crashes
        const { readFileSync } = require('fs') as typeof import('fs');
        const { join } = require('path') as typeof import('path');

        const filePath = join(process.cwd(), 'public', 'pdfjs', 'pdf.worker.min.js');
        _pdfJsWorkerSource = readFileSync(filePath, 'utf-8');
    }
    return _pdfJsWorkerSource;
}

/**
 * Optimizes a PDF by slicing it to the requested number of pages
 * This significantly reduces memory usage when processing large PDFs in Puppeteer
 */
async function optimizePdfForAnalysis(base64Pdf: string, maxPages: number): Promise<string> {
    if (maxPages <= 0) return base64Pdf;

    try {
        const pdfBytes = Buffer.from(base64Pdf, 'base64');
        const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const totalPages = pdfDoc.getPageCount();

        if (totalPages <= maxPages) {
            return base64Pdf;
        }

        logger.info(`✂️ Optimizing PDF for analysis: Slicing ${totalPages} pages to first ${maxPages} pages...`);

        const newPdf = await PDFDocument.create();
        const pageIndices = Array.from({ length: maxPages }, (_, i) => i);
        const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
        copiedPages.forEach(page => newPdf.addPage(page));

        const newPdfBytes = await newPdf.save();
        const newBase64 = Buffer.from(newPdfBytes).toString('base64');

        logger.info(`✅ PDF Optimized: Size reduced from ${(base64Pdf.length / 1024 / 1024).toFixed(2)}MB to ${(newBase64.length / 1024 / 1024).toFixed(2)}MB`);
        return newBase64;
    } catch (error) {
        logger.warn({ err: error }, '⚠️ PDF Optimization failed, falling back to original file');
        return base64Pdf;
    }
}

/**
 * Launch Puppeteer with safe flags for Windows/Linux/Docker
 */
async function launchBrowser() {
    return puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--memory-pressure-off',
            '--disable-extensions',
            '--disable-background-networking',
        ],
        protocolTimeout: 300000,
        timeout: 60000
    });
}

export async function convertPdfToImages(
    base64Pdf: string,
    maxPages: number = 0,
    onProgress?: (msg: string) => void,
    password?: string
): Promise<string[]> {
    logger.info(`🖼️ Converting PDF to High-Res Images (Limit: ${maxPages || 'None'})...`);

    // Optimize PDF if a limit is set
    let pdfToProcess = base64Pdf;
    if (maxPages > 0) {
        try {
            onProgress?.('✂️ Optimizing PDF structure...');
            const optimizationPromise = optimizePdfForAnalysis(base64Pdf, maxPages);
            const timeoutPromise = new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error('Optimization timeout')), 10000)
            );

            pdfToProcess = await Promise.race([optimizationPromise, timeoutPromise]);
        } catch (error) {
            logger.warn({ err: error }, '⚠️ PDF Optimization timed out or failed, falling back to original file');
            pdfToProcess = base64Pdf;
        }
    }

    // Pre-load PDF.js sources from disk (fail fast if files are missing)
    const pdfJsSource = getPdfJsSource();
    const pdfJsWorkerSource = getPdfJsWorkerSource();

    let browser;
    try {
        browser = await launchBrowser();
    } catch (launchError) {
        logger.error({ err: launchError }, '❌ Failed to launch Puppeteer browser');
        throw new Error(`Puppeteer launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`);
    }

    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(300000);
        page.setDefaultNavigationTimeout(300000);

        // Expose progress reporting function to the browser context
        await page.exposeFunction('reportConversionProgress', (current: number, total: number) => {
            const msg = `Converting page ${current} of ${total}...`;
            logger.info(`🖼️ ${msg}`);
            onProgress?.(msg);
        });

        // Build HTML with PDF.js inlined — no CDN required
        // Embed base64 PDF data directly to avoid network fetch inside Puppeteer
        const htmlContent = `<!DOCTYPE html>
<html>
<head>
<script>
${pdfJsWorkerSource}
</script>
<script>
${pdfJsSource}
</script>
</head>
<body>
<div id="container"></div>
<script>
// Set worker to use the inline worker blob
const workerBlob = new Blob([${JSON.stringify(pdfJsWorkerSource)}], { type: 'application/javascript' });
pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);

async function renderPdf(max) {
    try {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js library failed to load');
        }
        // Use inline base64 data to avoid network fetch failures in headless environments
        const base64Data = ${JSON.stringify(pdfToProcess)};
        const binaryStr = atob(base64Data);
        const pdfData = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            pdfData[i] = binaryStr.charCodeAt(i);
        }
        const loadingTask = pdfjsLib.getDocument({ data: pdfData, password: ${JSON.stringify(password || '')} });
        const pdf = await loadingTask.promise;
        const images = [];
        const totalPages = pdf.numPages;
        const pagesToRender = max > 0 ? Math.min(totalPages, max) : totalPages;

        // Render pages in parallel chunks of 10 to prevent timeout and memory overflow
        const chunkSize = 10;
        for (let i = 1; i <= pagesToRender; i += chunkSize) {
            const chunkEnd = Math.min(i + chunkSize - 1, pagesToRender);
            const chunkPromises = [];

            for (let j = i; j <= chunkEnd; j++) {
                chunkPromises.push((async (pageNum) => {
                    if (window.reportConversionProgress) {
                        await window.reportConversionProgress(pageNum, pagesToRender);
                    }
                    const page = await pdf.getPage(pageNum);
                    const scale = 1.0; // Reduced scale for faster identification
                    const viewport = page.getViewport({ scale });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    await page.render({ canvasContext: context, viewport }).promise;
                    return canvas.toDataURL('image/jpeg', 0.6).split(',')[1]; // Lower quality for speed
                })(j));
            }

            const chunkResults = await Promise.all(chunkPromises);
            images.push(...chunkResults);
        }
        return { success: true, images };
    } catch (err) {
        return { success: false, error: err.message || String(err) };
    }
}
</script>
</body>
</html>`;

        await page.setContent(htmlContent, { waitUntil: 'load', timeout: 300000 });

        const result = await page.evaluate(async (max) => {
            // @ts-ignore
            return await window.renderPdf(max);
        }, maxPages) as any;

        if (!result.success) {
            throw new Error(`PDF.js render error: ${result.error}`);
        }

        const images = result.images;
        logger.info(`✅ Converted ${images.length} pages to images.`);
        return images;

    } catch (error) {
        logger.error({ err: error }, '❌ PDF Conversion Error');
        throw error;
    } finally {
        try {
            await browser.close();
        } catch (closeError) {
            logger.warn({ err: closeError }, '⚠️ Browser close error (non-fatal)');
        }
    }
}

export async function extractTextFromPdf(base64Pdf: string, maxPages: number = 0, password?: string): Promise<string> {
    logger.info(`📄 Extracting text from PDF (Limit: ${maxPages || 'None'})...`);

    // Optimize PDF if a limit is set
    const pdfToProcess = maxPages > 0 ? await optimizePdfForAnalysis(base64Pdf, maxPages) : base64Pdf;

    // Pre-load PDF.js sources from disk
    const pdfJsSource = getPdfJsSource();
    const pdfJsWorkerSource = getPdfJsWorkerSource();

    let browser;
    try {
        browser = await launchBrowser();
    } catch (launchError) {
        logger.error({ err: launchError }, '❌ Failed to launch Puppeteer browser');
        throw new Error(`Puppeteer launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`);
    }

    try {
        const page = await browser.newPage();
        page.setDefaultTimeout(300000);
        page.setDefaultNavigationTimeout(300000);

        await page.setRequestInterception(true);
        page.on('request', request => {
            if (request.url() === 'http://localhost/document.pdf') {
                request.respond({
                    status: 200,
                    contentType: 'application/pdf',
                    body: Buffer.from(pdfToProcess, 'base64')
                });
            } else {
                request.continue();
            }
        });

        // Build HTML with PDF.js inlined — no CDN required
        const htmlContent = `<!DOCTYPE html>
<html>
<head>
<script>
${pdfJsWorkerSource}
</script>
<script>
${pdfJsSource}
</script>
</head>
<body>
<script>
const workerBlob = new Blob([${JSON.stringify(pdfJsWorkerSource)}], { type: 'application/javascript' });
pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);

async function getText(max) {
    try {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js library failed to load');
        }
        const loadingTask = pdfjsLib.getDocument({ url: 'http://localhost/document.pdf', password: ${JSON.stringify(password || '')} });
        const pdf = await loadingTask.promise;
        let fullText = '';
        const totalPages = pdf.numPages;
        const pagesToScan = max > 0 ? Math.min(totalPages, max) : totalPages;

        for (let i = 1; i <= pagesToScan; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += \`--- Page \${i} ---\\n\${pageText}\\n\\n\`;
        }
        return { success: true, text: fullText };
    } catch (err) {
        return { success: false, error: err.message || String(err) };
    }
}
</script>
</body>
</html>`;

        await page.setContent(htmlContent, { waitUntil: 'load', timeout: 300000 });

        const result = await page.evaluate(async (max) => {
            // @ts-ignore
            return await window.getText(max);
        }, maxPages) as any;

        if (!result.success) {
            throw new Error(`PDF.js text error: ${result.error}`);
        }

        const text = result.text;
        logger.info(`✅ Extracted ${text.length} characters of text from PDF.`);
        return text;

    } catch (error) {
        logger.error({ err: error }, '❌ PDF Text Extraction Error');
        throw error;
    } finally {
        try {
            await browser.close();
        } catch (closeError) {
            logger.warn({ err: closeError }, '⚠️ Browser close error (non-fatal)');
        }
    }
}
