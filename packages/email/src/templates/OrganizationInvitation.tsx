/**
 * Organization Invitation Email Template
 * Sent when a user is invited to join an organization
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

export interface OrganizationInvitationProps {
  inviterName: string;
  organizationName: string;
  inviteLink: string;
  role: string;
  expiresIn?: string;
}

/**
 * Organization invitation email template
 */
export function OrganizationInvitation({
  inviterName = 'A team member',
  organizationName = 'Your Organization',
  inviteLink = 'https://app.authlane.dev/accept-invitation/xxx',
  role = 'member',
  expiresIn = '48 hours',
}: OrganizationInvitationProps) {
  const previewText = `Join ${organizationName} on Authlane`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>
            You&apos;ve been invited to join {organizationName}
          </Heading>
          
          <Text style={paragraph}>
            <strong>{inviterName}</strong> has invited you to join{' '}
            <strong>{organizationName}</strong> as a <strong>{role}</strong> on Authlane.
          </Text>
          
          <Section style={buttonContainer}>
            <Button style={button} href={inviteLink}>
              Accept Invitation
            </Button>
          </Section>
          
          <Text style={paragraph}>
            This invitation will expire in {expiresIn}. If you don&apos;t want to join,
            you can safely ignore this email.
          </Text>
          
          <Hr style={hr} />
          
          <Text style={footer}>
            If the button above doesn&apos;t work, copy and paste this link into your browser:
          </Text>
          <Link href={inviteLink} style={link}>
            {inviteLink}
          </Link>
          
          <Hr style={hr} />
          
          <Text style={footerSmall}>
            This email was sent by Authlane. If you didn&apos;t expect this invitation,
            you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default OrganizationInvitation;

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
  backgroundColor: '#2563eb',
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
  color: '#2563eb',
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

