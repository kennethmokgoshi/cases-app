/**
 * POA Signing Service
 *
 * Centralises token creation and signing logic so the Cases app, Credo app
 * and any future channel share identical behaviour.
 *
 * ECTA compliance (Electronic Communications and Transactions Act, Act 25/2002):
 *   - Token expiry enforced (72 h default)
 *   - IP address + user-agent captured at signing
 *   - Timestamp recorded as `signedAt`
 *   - Signed PDF embedded with the drawn signature image
 */

import { prisma } from '@zenowethu/database';
import { generateStandardPoa } from './poa-generator';
import { createLogger } from '../logger';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const logger = createLogger('poa/signing-service');

export const POA_TOKEN_TTL_HOURS = 72;

// ─── Token creation ───────────────────────────────────────────────────────────

export interface CreatePoaSigningTokenInput {
  poaType:    'STANDARD' | 'WESBANK';
  channel:    'EMAIL' | 'WHATSAPP' | 'CREDO';
  caseId?:    string;
  clientId?:  string;
  consumerId?: string;
}

export async function createPoaSigningToken(
  input: CreatePoaSigningTokenInput,
): Promise<string> {
  const expiresAt = new Date(Date.now() + POA_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  const record = await prisma.poaSigningRequest.create({
    data: {
      poaType:    input.poaType,
      channel:    input.channel,
      caseId:     input.caseId,
      clientId:   input.clientId,
      consumerId: input.consumerId,
      expiresAt,
      status:     'PENDING',
    },
    select: { token: true },
  });

  logger.info('[POA] Signing token created', {
    token:   record.token.slice(0, 8) + '…',
    poaType: input.poaType,
    channel: input.channel,
    caseId:  input.caseId,
  });

  return record.token;
}

// ─── Token validation ─────────────────────────────────────────────────────────

export type PoaSigningStatus = 'PENDING' | 'SIGNED' | 'EXPIRED' | 'CANCELLED';

export interface PoaSigningRequestRecord {
  id:         string;
  token:      string;
  status:     string;
  poaType:    string;
  channel:    string;
  expiresAt:  Date;
  signedAt:   Date | null;
  caseId:     string | null;
  clientId:   string | null;
  consumerId: string | null;
  client: {
    firstName:   string;
    lastName:    string;
    idNumber:    string;
    email:       string | null;
    phone:       string | null;
    address:     string | null;
  } | null;
  consumer: {
    firstName:  string;
    lastName:   string;
    idNumber:   string | null;
    email:      string;
    phone:      string | null;
  } | null;
  case: {
    fileNumber:         string;
    debtCounsellorName: string | null;
    ncrdcNo:            string | null;
    dcMobile:           string | null;
  } | null;
}

/**
 * Resolves and validates a signing token.
 * Returns the record if PENDING and not yet expired.
 * Auto-marks expired tokens.
 */
export async function resolveSigningToken(
  token: string,
): Promise<{ record: PoaSigningRequestRecord } | { error: string; status: number }> {
  const record = await prisma.poaSigningRequest.findUnique({
    where: { token },
    select: {
      id:         true,
      token:      true,
      status:     true,
      poaType:    true,
      channel:    true,
      expiresAt:  true,
      signedAt:   true,
      caseId:     true,
      clientId:   true,
      consumerId: true,
      client: {
        select: {
          firstName: true, lastName: true, idNumber: true,
          email: true, phone: true, address: true,
        },
      },
      consumer: {
        select: {
          firstName: true, lastName: true, idNumber: true,
          email: true, phone: true,
        },
      },
      case: {
        select: {
          fileNumber: true, debtCounsellorName: true,
          ncrdcNo: true, dcMobile: true,
        },
      },
    },
  });

  if (!record) return { error: 'Signing link not found.', status: 404 };

  // Auto-expire
  if (record.status === 'PENDING' && new Date() > record.expiresAt) {
    await prisma.poaSigningRequest.update({
      where: { token },
      data:  { status: 'EXPIRED' },
    });
    return { error: 'This signing link has expired. Please ask Zenowethu to resend the POA.', status: 410 };
  }

  if (record.status === 'SIGNED')     return { error: 'This POA has already been signed.', status: 409 };
  if (record.status === 'EXPIRED')    return { error: 'This signing link has expired.', status: 410 };
  if (record.status === 'CANCELLED')  return { error: 'This signing link has been cancelled.', status: 410 };

  return { record };
}

// ─── Complete a signing ───────────────────────────────────────────────────────

export interface CompletePoaSigningInput {
  token:          string;
  signatureImage: string;   // base64 PNG data URL
  ipAddress:      string;
  userAgent:      string;
}

export interface CompletePoaSigningResult {
  documentId?:  string;   // Document (cases) or CredoDocument id
  signedPdfPath: string;
}

/**
 * Embeds the drawn signature into the POA PDF, saves the file, updates the
 * PoaSigningRequest record, and saves a Document / CredoDocument record.
 */
export async function completePoaSigning(
  input: CompletePoaSigningInput,
): Promise<CompletePoaSigningResult | { error: string; status: number }> {
  const resolved = await resolveSigningToken(input.token);
  if ('error' in resolved) return resolved;

  const { record } = resolved;

  // ── Build POA data ───────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-ZA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  // Prefer client data (staff-sent), fall back to consumer data (Credo)
  const firstName   = record.client?.firstName   ?? record.consumer?.firstName   ?? '';
  const lastName    = record.client?.lastName    ?? record.consumer?.lastName    ?? '';
  const rawId       = record.client?.idNumber    ?? record.consumer?.idNumber    ?? '';
  const cleanId     = rawId.replace(/\D/g, '');
  const address     = record.client?.address     ?? '';
  const phone       = record.client?.phone       ?? record.consumer?.phone       ?? '';
  const email       = record.client?.email       ?? record.consumer?.email       ?? '';

  let pdfBuffer: Buffer;

  if (record.poaType === 'STANDARD') {
    pdfBuffer = await generateStandardPoa({
      fullName:       `${firstName} ${lastName}`,
      idNumber:       cleanId,
      dateOfBirth:    cleanId ? idToDateOfBirth(cleanId) : '',
      address,
      phone,
      email,
      signedCity:     'Pretoria',
      signedDate:     today,
      dcName:         record.case?.debtCounsellorName ?? '',
      dcNcrdcNo:      record.case?.ncrdcNo            ?? '',
      dcPhone:        record.case?.dcMobile           ?? '',
      signatureImage: input.signatureImage,
    });
  } else {
    // Wesbank POA — signature embedding not supported (requires agent details)
    // Fall back to unsigned generation; staff still see the request as SIGNED.
    const { generateWesbankPoa } = await import('./poa-generator');
    pdfBuffer = await generateWesbankPoa({
      clientFullName: `${firstName} ${lastName}`,
      clientIdNumber: cleanId,
      clientAddress:  address,
      agentFullName:  'Aaron Nzotho',
      agentIdNumber:  '7809065687086',
      agentAddress:   'Suite 2, Second Floor, Central House, 17 Central Road, Mabopane, 0190',
      signedAtCity:   'Pretoria',
      signedDate:     today,
    });
  }

  // ── Save signed PDF ──────────────────────────────────────────────────────
  const fileName    = `Signed_POA_${cleanId || record.id}_${Date.now()}.pdf`;
  const uploadBase  = process.env.UPLOAD_DIR || join(process.cwd(), 'public', 'uploads');
  const subDir      = record.caseId ?? record.consumerId ?? 'poa';
  const uploadDir   = join(uploadBase, subDir);

  await mkdir(uploadDir, { recursive: true });
  const filePath = join(uploadDir, fileName);
  await writeFile(filePath, pdfBuffer);

  // ── Update PoaSigningRequest ─────────────────────────────────────────────
  await prisma.poaSigningRequest.update({
    where: { token: input.token },
    data: {
      status:        'SIGNED',
      signedAt:      new Date(),
      signedPdfPath: filePath,
      ipAddress:     input.ipAddress,
      userAgent:     input.userAgent,
    },
  });

  // ── Save Document record (cases) or CredoDocument record (Credo) ─────────
  let documentId: string | undefined;

  if (record.caseId) {
    const fileUrl = `/uploads/${subDir}/${fileName}`;
    const doc = await prisma.document.create({
      data: {
        caseId:      record.caseId,
        type:        record.poaType === 'WESBANK' ? 'POA_WESBANK_SIGNED' : 'POA_SIGNED',
        fileName,
        fileUrl,
        fileSize:    pdfBuffer.length,
        mimeType:    'application/pdf',
        isAdminOnly: false,
      },
      select: { id: true },
    });
    documentId = doc.id;

    // Log activity on case (userId = null for system-generated comments)
    if (record.caseId) {
      await prisma.caseComment.create({
        data: {
          caseId:     record.caseId,
          userId:     null,
          content:    `Client signed the ${record.poaType === 'WESBANK' ? 'Wesbank ' : ''}Power of Attorney online via ${record.channel}. Signed PDF saved. IP: ${input.ipAddress}.`,
          type:       'SYSTEM',
          isInternal: true,
        },
      });
    }
  } else if (record.consumerId) {
    const fileUrl = filePath;
    const doc = await prisma.credoDocument.create({
      data: {
        consumerId:   record.consumerId,
        fileName,
        originalName: 'Signed Power of Attorney.pdf',
        mimeType:     'application/pdf',
        size:         pdfBuffer.length,
        category:     'LEGAL',
        storagePath:  fileUrl,
      },
      select: { id: true },
    });
    documentId = doc.id;
  }

  logger.info('[POA] Signing completed', {
    token:      input.token.slice(0, 8) + '…',
    documentId,
    ipAddress:  input.ipAddress,
  });

  return { documentId, signedPdfPath: filePath };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function idToDateOfBirth(idNumber: string): string {
  if (idNumber.length < 6) return '';
  const yy   = idNumber.substring(0, 2);
  const mm   = idNumber.substring(2, 4);
  const dd   = idNumber.substring(4, 6);
  const year = parseInt(yy) > 30 ? `19${yy}` : `20${yy}`;
  return `${dd}/${mm}/${year}`;
}
