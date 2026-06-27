// Verifies SMTP login only (EHLO + AUTH) — sends no email.
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'mail.zenowethu.co.za',
    port: 587,
    secure: false,
    auth: {
        user: 'transfer@zenowethu.co.za',
        pass: 'Transfer@D2025',
    },
    tls: { rejectUnauthorized: false },
});

transporter.verify()
    .then(() => console.log('✅ SMTP login OK — credentials are valid'))
    .catch(err => console.error('❌ SMTP login FAILED:', err.message));
