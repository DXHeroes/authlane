import type { EmailResult } from '@authlane/email';

export function requireEmailDelivery(result: EmailResult): void {
  if (!result.success) {
    throw new Error('Authentication email delivery failed');
  }
}
