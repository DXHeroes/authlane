/**
 * Email Verification Template
 * Sent when a user needs to verify their email address
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

export interface EmailVerificationProps {
  userName?: string;
  verificationLink: string;
  expiresIn?: string;
}

/**
 * Email verification template
 */
export function EmailVerification({
  userName = 'there',
  verificationLink = 'https://app.authlane.dev/verify-email?token=xxx',
  expiresIn = '24 hours',
}: EmailVerificationProps) {
  const previewText = 'Verify your email address for Authlane';

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Verify your email address</Heading>

          <Text style={paragraph}>Hi {userName},</Text>

          <Text style={paragraph}>
            Thanks for signing up for Authlane! Please verify your email address by clicking the
            button below.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={verificationLink}>
              Verify Email Address
            </Button>
          </Section>

          <Text style={paragraph}>
            This link will expire in {expiresIn}. If you didn&apos;t create an account on Authlane,
            you can safely ignore this email.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            If the button above doesn&apos;t work, copy and paste this link into your browser:
          </Text>
          <Link href={verificationLink} style={link}>
            {verificationLink}
          </Link>

          <Hr style={hr} />

          <Text style={footerSmall}>
            This email was sent by Authlane. If you didn&apos;t sign up for an account, you can
            ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default EmailVerification;

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
  backgroundColor: '#10b981',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 32px',
};

const hr = {
  borderColor: '#e5e7eb',
  margin: '24px 0',
};

const link = {
  color: '#10b981',
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
