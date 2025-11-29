/**
 * Welcome Email Template
 * Sent after a user successfully joins an organization
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

export interface WelcomeEmailProps {
  userName: string;
  organizationName: string;
  dashboardLink: string;
  role: string;
}

/**
 * Welcome email template after joining an organization
 */
export function WelcomeEmail({
  userName = 'there',
  organizationName = 'Your Organization',
  dashboardLink = 'https://app.authlane.dev/dashboard',
  role = 'member',
}: WelcomeEmailProps) {
  const previewText = `Welcome to ${organizationName} on Authlane!`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>
            Welcome to {organizationName}! 🎉
          </Heading>
          
          <Text style={paragraph}>
            Hi {userName},
          </Text>
          
          <Text style={paragraph}>
            You&apos;ve successfully joined <strong>{organizationName}</strong> as a <strong>{role}</strong>.
            You can now access all the features and integrations available to your team.
          </Text>
          
          <Section style={featureBox}>
            <Text style={featureTitle}>What you can do now:</Text>
            <Text style={featureItem}>• Connect third-party services like GitHub, Slack, and more</Text>
            <Text style={featureItem}>• Manage your integrations from the dashboard</Text>
            <Text style={featureItem}>• Collaborate with your team members</Text>
          </Section>
          
          <Section style={buttonContainer}>
            <Button style={button} href={dashboardLink}>
              Go to Dashboard
            </Button>
          </Section>
          
          <Hr style={hr} />
          
          <Text style={footer}>
            Need help getting started? Check out our{' '}
            <Link href="https://docs.authlane.dev" style={link}>
              documentation
            </Link>{' '}
            or reach out to your team administrator.
          </Text>
          
          <Hr style={hr} />
          
          <Text style={footerSmall}>
            This email was sent by Authlane. You received this email because you joined {organizationName}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default WelcomeEmail;

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

const featureBox = {
  backgroundColor: '#f3f4f6',
  borderRadius: '6px',
  padding: '20px',
  margin: '24px 0',
};

const featureTitle = {
  color: '#1a1a1a',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 12px',
};

const featureItem = {
  color: '#525252',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 8px',
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
};

const footer = {
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0',
};

const footerSmall = {
  color: '#9ca3af',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '0',
};

