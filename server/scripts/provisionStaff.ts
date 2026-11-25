import { PrismaClient, Role } from '@prisma/client';
import readline from 'readline';
import { hashStaffPassword } from '../src/services/staffAuthService.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const LOCAL_DATABASE_PREFIX = 'matinee_m0520_';

function requireLocalTarget(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!LOCAL_HOSTS.has(parsed.hostname) || !databaseName.startsWith(LOCAL_DATABASE_PREFIX)) {
    throw new Error('Refusing to provision staff: target must be a localhost database named matinee_m0520_*.');
  }
  if (process.env.STAFF_PROVISION_ALLOW_LOCAL !== 'true') {
    throw new Error('Set STAFF_PROVISION_ALLOW_LOCAL=true for an explicit local provisioning operation.');
  }
  return databaseUrl;
}

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    if (!stdin.isTTY || !stdout.isTTY) {
      reject(new Error('Password input must be an interactive terminal; STAFF_PASSWORD is not accepted.'));
      return;
    }
    stdout.write(prompt);
    stdin.setRawMode?.(true);
    stdin.resume();
    let value = '';
    const onData = (chunk: Buffer) => {
      const key = chunk.toString('utf8');
      if (key === '\u0003') {
        cleanup();
        reject(new Error('Cancelled.'));
      } else if (key === '\r' || key === '\n') {
        cleanup();
        stdout.write('\n');
        resolve(value);
      } else if (key === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += key;
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode?.(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const databaseUrl = requireLocalTarget();
  const email = process.env.STAFF_EMAIL?.trim().toLowerCase();
  const role = process.env.STAFF_ROLE as Role | undefined;
  const deactivationEmail = process.env.STAFF_DEACTIVATE_EMAIL?.trim().toLowerCase();
  if (!email && !deactivationEmail) throw new Error('Set STAFF_EMAIL or STAFF_DEACTIVATE_EMAIL.');
  if (email && role !== Role.CINEMA_ADMIN && role !== Role.SYSTEM_ADMIN) {
    throw new Error('STAFF_ROLE must be CINEMA_ADMIN or SYSTEM_ADMIN.');
  }
  const staffRole = role as 'CINEMA_ADMIN' | 'SYSTEM_ADMIN';

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    if (deactivationEmail) {
      await prisma.user.update({
        where: { email: deactivationEmail },
        data: { role: Role.CUSTOMER, passwordHash: null, authVersion: { increment: 1 } },
      });
      console.log('Staff account deactivated.');
      return;
    }

    const password = await readHidden('New staff password: ');
    const confirmation = await readHidden('Confirm staff password: ');
    if (password !== confirmation) throw new Error('Passwords do not match.');
    const passwordHash = await hashStaffPassword(password);
    await prisma.user.upsert({
      where: { email },
      create: { email, role: staffRole, passwordHash, authVersion: 1 },
      update: { role: staffRole, passwordHash, authVersion: { increment: 1 } },
    });
    console.log('Staff account provisioned.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
