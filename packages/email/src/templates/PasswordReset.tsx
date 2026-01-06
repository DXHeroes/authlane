/**
 * Password Reset Email Template
 * Sent when a user requests to reset their password
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

export interface PasswordResetProps {
  userName?: string;
  resetLink: string;
  expiresIn?: string;
}

/**
 * Password reset email template
 */
export function PasswordReset({
  userName = 'there',
  resetLink = 'https://app.authlane.dev/reset-password?token=xxx',
  expiresIn = '1 hour',
}: PasswordResetProps) {
  const previewText = 'Reset your Authlane password';

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Reset your password</Heading>

          <Text style={paragraph}>Hi {userName},</Text>

          <Text style={paragraph}>
            We received a request to reset your password for your Authlane account. Click the button
            below to create a new password.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={resetLink}>
              Reset Password
            </Button>
          </Section>

          <Text style={paragraph}>
            This link will expire in {expiresIn}. If you didn&apos;t request a password reset, you
            can safely ignore this email. Your password will remain unchanged.
          </Text>

          <Section style={warningBox}>
            <Text style={warningText}>
              ⚠️ If you didn&apos;t request this password reset, someone may be trying to access your
              account. Consider enabling two-factor authentication for added security.
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            If the button above doesn&apos;t work, copy and paste this link into your browser:
          </Text>
          <Link href={resetLink} style={link}>
            {resetLink}
          </Link>

          <Hr style={hr} />

          <Text style={footerSmall}>
            This email was sent by Authlane. If you didn&apos;t request a password reset, you can
            ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default PasswordReset;

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '560px',
  borderRadius: '8px',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
};

const heading = {
  color: '#1a1a1a',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '1.3',
  margin: '0 0 24px',
  textAlign: 'center' as const,
};

const paragraph = {
  color: '#525252',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 16px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#dc2626',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 32px',
};

const warningBox = {
  backgroundColor: '#fef3c7',
  borderRadius: '6px',
  padding: '16px',
  margin: '24px 0',
};

const warningText = {
  color: '#92400e',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0',
};

const hr = {
  borderColor: '#e5e7eb',
  margin: '24px 0',
};

const link = {
  color: '#dc2626',
  fontSize: '14px',
  wordBreak: 'break-all' as const,
};

const footer = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0 0 8px',
};

const footerSmall = {
  color: '#9ca3af',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '0',
};
