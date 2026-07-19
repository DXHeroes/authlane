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

export interface MagicLinkProps {
  magicLink: string;
  expiresIn?: string;
}

export function MagicLink({ magicLink, expiresIn = '10 minutes' }: MagicLinkProps) {
  return (
    <Html>
      <Head />
      <Preview>Your secure Authlane sign-in link</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Sign in to Authlane</Heading>
          <Text style={paragraph}>
            Use this secure, one-time link to sign in. It expires in {expiresIn}.
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href={magicLink}>
              Sign in to Authlane
            </Button>
          </Section>
          <Text style={paragraph}>
            If you didn&apos;t request this link, you can safely ignore this email.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>If the button does not work, open this link:</Text>
          <Link href={magicLink} style={link}>
            {magicLink}
          </Link>
        </Container>
      </Body>
    </Html>
  );
}

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
};
const heading = {
  color: '#1a1a1a',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '1.3',
  margin: '0 0 24px',
  textAlign: 'center' as const,
};
const paragraph = { color: '#525252', fontSize: '16px', lineHeight: '1.6', margin: '0 0 16px' };
const buttonContainer = { textAlign: 'center' as const, margin: '32px 0' };
const button = {
  backgroundColor: '#2563eb',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  padding: '12px 32px',
};
const hr = { borderColor: '#e5e7eb', margin: '24px 0' };
const footer = { color: '#6b7280', fontSize: '14px', lineHeight: '1.5', margin: '0 0 8px' };
const link = { color: '#2563eb', fontSize: '14px', wordBreak: 'break-all' as const };
