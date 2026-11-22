import crypto from 'crypto';
import { AppError } from '../../middleware/errorHandler.js';

export const SIGNATURE_TOLERANCE_SECONDS = 300; // 5 minutes

export interface PaystackV2SignatureItem {
  keyId?: string;
  signature: string;
}

export interface PaystackV2SignatureParts {
  timestamp: number;
  signatures: PaystackV2SignatureItem[];
}

/**
 * Parses the modern Paystack-Signature header:
 * Format: "t=<unix_seconds>,v1=<key_id>:<signature>"
 * Supports multiple v1 entries: "t=1700000000,v1=whk_1:sig1,v1=whk_2:sig2"
 * Also supports optional keyId omission: "t=1700000000,v1=sig1"
 */
export function parsePaystackV2Header(headerValue: string): PaystackV2SignatureParts {
  if (!headerValue || typeof headerValue !== 'string' || !headerValue.trim()) {
    throw new AppError(
      'Paystack-Signature header is missing or empty',
      401,
      'INVALID_WEBHOOK_SIGNATURE'
    );
  }

  const parts = headerValue.split(',').map((p) => p.trim()).filter(Boolean);
  let timestamp: number | null = null;
  const signatures: PaystackV2SignatureItem[] = [];

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) {
      throw new AppError(
        'Paystack-Signature header contains malformed parameter',
        401,
        'INVALID_WEBHOOK_SIGNATURE'
      );
    }
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();

    if (key === 't') {
      if (timestamp !== null) {
        throw new AppError(
          'Paystack-Signature header contains duplicate timestamp parameter (t=)',
          401,
          'INVALID_WEBHOOK_SIGNATURE'
        );
      }
      if (!/^\d+$/.test(val)) {
        throw new AppError(
          'Paystack-Signature header contains non-numeric timestamp',
          401,
          'INVALID_WEBHOOK_SIGNATURE'
        );
      }
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed <= 0) {
        throw new AppError(
          'Paystack-Signature header contains invalid timestamp',
          401,
          'INVALID_WEBHOOK_SIGNATURE'
        );
      }
      timestamp = parsed;
    } else if (key === 'v1') {
      if (!val) {
        throw new AppError(
          'Paystack-Signature header contains empty v1 signature',
          401,
          'INVALID_WEBHOOK_SIGNATURE'
        );
      }
      const colonIdx = val.indexOf(':');
      if (colonIdx !== -1) {
        const keyId = val.slice(0, colonIdx).trim();
        const signature = val.slice(colonIdx + 1).trim();
        if (signature) {
          signatures.push({ keyId: keyId || undefined, signature });
        }
      } else {
        signatures.push({ signature: val });
      }
    }
  }

  if (timestamp === null) {
    throw new AppError(
      'Paystack-Signature header is missing timestamp parameter (t=)',
      401,
      'INVALID_WEBHOOK_SIGNATURE'
    );
  }

  if (signatures.length === 0) {
    throw new AppError(
      'Paystack-Signature header contains no v1 signature entries',
      401,
      'INVALID_WEBHOOK_SIGNATURE'
    );
  }

  return { timestamp, signatures };
}

/**
 * Validates the modern Paystack-Signature format (HMAC-SHA512 of `${timestamp}.${rawBody}`).
 *
 * Specification Rules:
 * 1. Header contains t=<unix_seconds>,v1=<key-id>:<signature>
 * 2. Signed payload is String(timestamp) + "." + exact raw body UTF-8 bytes.
 * 3. Compared in constant time using crypto.timingSafeEqual.
 * 4. Rejects if timestamp differs from server time by > 300 seconds.
 * 5. Supports key rotation (evaluates against multiple configured secrets / v1 entries).
 */
export function verifyPaystackV2Signature(
  rawBody: Buffer | string,
  headerValue: string,
  secrets: string | string[],
  currentTimestampSeconds: number = Math.floor(Date.now() / 1000)
): { valid: boolean; reason?: string } {
  if (
    rawBody === undefined ||
    rawBody === null ||
    (Buffer.isBuffer(rawBody) && rawBody.length === 0) ||
    (typeof rawBody === 'string' && rawBody.length === 0)
  ) {
    return { valid: false, reason: 'RAW_BODY_MISSING' };
  }

  if (!headerValue || !headerValue.trim()) {
    return { valid: false, reason: 'EMPTY_HEADER' };
  }

  let parsed: PaystackV2SignatureParts;
  try {
    parsed = parsePaystackV2Header(headerValue.trim());
  } catch (err: any) {
    return { valid: false, reason: err.code || 'MALFORMED_HEADER' };
  }

  const { timestamp, signatures } = parsed;

  // Drift / replay check: must be within 300s of current server time
  if (Math.abs(currentTimestampSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return { valid: false, reason: 'TIMESTAMP_OUT_OF_RANGE' };
  }

  const rawBytes = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const signedPayload = Buffer.concat([
    Buffer.from(`${timestamp}.`, 'utf8'),
    rawBytes,
  ]);

  const secretList = (Array.isArray(secrets) ? secrets : [secrets])
    .map((s) => s.trim())
    .filter(Boolean);

  if (secretList.length === 0) {
    return { valid: false, reason: 'NO_WEBHOOK_SECRETS_CONFIGURED' };
  }

  for (const secret of secretList) {
    const computedHex = crypto
      .createHmac('sha512', secret)
      .update(signedPayload)
      .digest('hex')
      .toLowerCase();

    const computedBuffer = Buffer.from(computedHex, 'utf8');

    for (const sigItem of signatures) {
      const candidateHex = sigItem.signature.toLowerCase();
      // SHA512 hex is 128 characters
      if (candidateHex.length !== 128 || !/^[0-9a-f]{128}$/.test(candidateHex)) {
        continue;
      }
      const candidateBuffer = Buffer.from(candidateHex, 'utf8');
      if (
        candidateBuffer.length === computedBuffer.length &&
        crypto.timingSafeEqual(candidateBuffer, computedBuffer)
      ) {
        return { valid: true };
      }
    }
  }

  return { valid: false, reason: 'SIGNATURE_MISMATCH' };
}

/**
 * Validates legacy x-paystack-signature format (HMAC-SHA512 of exact rawBody).
 *
 * Specification Rules:
 * 1. Uses the Paystack secret API key (sk_test_...).
 * 2. HMAC-SHA512 over exact raw body bytes only.
 * 3. Compared in constant time using crypto.timingSafeEqual.
 * 4. Header is a 128-character hex string without timestamp prefix.
 */
export function verifyLegacyPaystackSignature(
  rawBody: Buffer | string,
  headerValue: string,
  secretKey: string
): { valid: boolean; reason?: string } {
  if (
    rawBody === undefined ||
    rawBody === null ||
    (Buffer.isBuffer(rawBody) && rawBody.length === 0) ||
    (typeof rawBody === 'string' && rawBody.length === 0)
  ) {
    return { valid: false, reason: 'RAW_BODY_MISSING' };
  }

  if (!headerValue || !headerValue.trim() || !secretKey || !secretKey.trim()) {
    return { valid: false, reason: 'MISSING_PARAMETERS' };
  }

  const cleanSig = headerValue.trim().toLowerCase();
  if (cleanSig.length !== 128 || !/^[0-9a-f]{128}$/.test(cleanSig)) {
    return { valid: false, reason: 'MALFORMED_SIGNATURE' };
  }

  const rawBytes = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const computedHex = crypto
    .createHmac('sha512', secretKey.trim())
    .update(rawBytes)
    .digest('hex')
    .toLowerCase();

  const sigBuffer = Buffer.from(cleanSig, 'utf8');
  const computedBuffer = Buffer.from(computedHex, 'utf8');

  if (sigBuffer.length !== computedBuffer.length) {
    return { valid: false, reason: 'LENGTH_MISMATCH' };
  }

  if (crypto.timingSafeEqual(sigBuffer, computedBuffer)) {
    return { valid: true };
  }

  return { valid: false, reason: 'SIGNATURE_MISMATCH' };
}

export interface VerifyIncomingHeaders {
  paystackSignature?: string;
  legacySignature?: string;
}

export interface VerifyIncomingOptions {
  webhookSecrets: string | string[];
  legacySecretKey?: string;
  nowSeconds?: number;
}

/**
 * Orchestrates webhook verification with strict specification precedence:
 *
 * 1. Modern Paystack-Signature is preferred when present.
 * 2. If modern header is present and fails, immediately throws 401. NEVER falls back to legacy!
 * 3. Legacy x-paystack-signature is evaluated ONLY if modern header is absent.
 * 4. If neither header is present, throws 401 MISSING_WEBHOOK_SIGNATURE.
 */
export function verifyIncomingWebhookSignature(
  rawBody: Buffer | string,
  headers: VerifyIncomingHeaders,
  options: VerifyIncomingOptions
): { scheme: 'v2' | 'legacy'; verified: boolean } {
  const { paystackSignature, legacySignature } = headers;

  if (
    rawBody === undefined ||
    rawBody === null ||
    (Buffer.isBuffer(rawBody) && rawBody.length === 0) ||
    (typeof rawBody === 'string' && rawBody.length === 0)
  ) {
    throw new AppError(
      'Exact raw request body bytes are required for webhook signature verification',
      400,
      'RAW_BODY_MISSING'
    );
  }

  // 1. Preferred modern format (Paystack-Signature)
  // If modern signature parameter was supplied at all (even if empty or invalid),
  // evaluate it strictly. NEVER fall back to legacy if modern parameter was provided!
  if (paystackSignature !== undefined) {
    if (!paystackSignature || !paystackSignature.trim()) {
      throw new AppError(
        'Paystack-Signature verification failed (EMPTY_HEADER)',
        401,
        'INVALID_WEBHOOK_SIGNATURE'
      );
    }

    const result = verifyPaystackV2Signature(
      rawBody,
      paystackSignature,
      options.webhookSecrets,
      options.nowSeconds
    );

    if (!result.valid) {
      // STRICT SAFETY GATE: Never fall back to legacy if modern signature is supplied
      throw new AppError(
        `Paystack-Signature verification failed (${result.reason || 'INVALID_SIGNATURE'})`,
        401,
        'INVALID_WEBHOOK_SIGNATURE'
      );
    }

    return { scheme: 'v2', verified: true };
  }

  // 2. Legacy fallback format (x-paystack-signature) - ONLY when modern header is absent
  if (legacySignature !== undefined) {
    if (!legacySignature || !legacySignature.trim()) {
      throw new AppError(
        'Legacy webhook signature verification failed (MISSING_PARAMETERS)',
        401,
        'INVALID_WEBHOOK_SIGNATURE'
      );
    }

    if (!options.legacySecretKey || !options.legacySecretKey.trim()) {
      throw new AppError(
        'Legacy Paystack webhook signature verification is not configured',
        401,
        'LEGACY_VERIFICATION_DISABLED'
      );
    }

    const result = verifyLegacyPaystackSignature(
      rawBody,
      legacySignature,
      options.legacySecretKey
    );

    if (!result.valid) {
      throw new AppError(
        `Legacy webhook signature verification failed (${result.reason || 'INVALID_SIGNATURE'})`,
        401,
        'INVALID_WEBHOOK_SIGNATURE'
      );
    }

    return { scheme: 'legacy', verified: true };
  }

  // 3. No signature header supplied
  throw new AppError(
    'Missing required webhook signature header (Paystack-Signature or x-paystack-signature)',
    401,
    'MISSING_WEBHOOK_SIGNATURE'
  );
}
