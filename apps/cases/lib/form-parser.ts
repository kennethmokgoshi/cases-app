import busboy from 'busboy';

export async function parseMultipartForm(request: Request, maxFileSize = 10 * 1024 * 1024) {
    const contentType = request.headers.get('content-type') || '';
    const buffer = await request.arrayBuffer();

    return new Promise<{ fields: Record<string, string>, files: Array<{ name: string, fieldName: string, buffer: Buffer, type: string }> }>((resolve, reject) => {
        const bb = busboy({
            headers: { 'content-type': contentType },
            limits: { fileSize: maxFileSize }
        });

        const fields: Record<string, string> = {};
        const files: Array<{ name: string, fieldName: string, buffer: Buffer, type: string }> = [];

        bb.on('field', (name, val) => {
            fields[name] = val;
        });

        bb.on('file', (name, file, info) => {
            const chunks: Buffer[] = [];
            file.on('data', (chunk) => chunks.push(chunk));
            file.on('end', () => {
                files.push({
                    name: info.filename,
                    fieldName: name,
                    buffer: Buffer.concat(chunks),
                    type: info.mimeType
                });
            });
        });

        bb.on('error', (err) => reject(err));
        bb.on('finish', () => resolve({ fields, files }));

        bb.end(Buffer.from(buffer));
    });
}
