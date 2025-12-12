# Threat Model

Analysis of potential threats to Authlane and implemented mitigations.

## Overview

This document outlines the threat landscape for Authlane, identifying potential attack vectors and the security controls implemented to mitigate them.

## Assets to Protect

### High Value Assets

| Asset | Description | Impact if Compromised |
|-------|-------------|----------------------|
| OAuth tokens | User access/refresh tokens | Full access to user's third-party accounts |
| Encryption keys | Master and derived keys | All credentials exposed |
| API keys | Customer API keys | Unauthorized API access |
| User data | PII and account information | Privacy violation, legal liability |

### Medium Value Assets

| Asset | Description | Impact if Compromised |
|-------|-------------|----------------------|
| Session tokens | User sessions | Account takeover |
| Configuration | Service settings | Service disruption |
| Audit logs | Security event logs | Forensic data loss |

## Threat Actors

### External Attackers

| Actor | Motivation | Capabilities |
|-------|------------|--------------|
| Script Kiddies | Fame, vandalism | Low - automated tools |
| Cybercriminals | Financial gain | Medium - targeted attacks |
| Nation States | Espionage, disruption | High - advanced persistent threats |

### Internal Threats

| Actor | Motivation | Capabilities |
|-------|------------|--------------|
| Malicious insider | Financial, revenge | High - legitimate access |
| Compromised account | N/A (external control) | Varies by role |
| Negligent employee | None (accidental) | Varies by role |

## Attack Vectors

### 1. API Attacks

#### 1.1 Authentication Bypass

**Threat**: Attacker bypasses API authentication.

**Attack scenarios**:
- Brute force API key guessing
- Timing attacks on authentication
- Session token prediction

**Mitigations**:
```
✓ 256-bit random API keys (infeasible to guess)
✓ Constant-time hash comparison
✓ Cryptographically secure session tokens
✓ Rate limiting on auth endpoints
✓ Account lockout after failures
```

#### 1.2 Injection Attacks

**Threat**: SQL, NoSQL, or command injection.

**Attack scenarios**:
- Malicious input in API parameters
- Header injection
- Log injection

**Mitigations**:
```
✓ Parameterized queries (Drizzle ORM)
✓ Input validation with Zod schemas
✓ Output encoding for logs
✓ Content-Type validation
```

#### 1.3 Authorization Bypass

**Threat**: Access to resources without proper authorization.

**Attack scenarios**:
- IDOR (Insecure Direct Object Reference)
- Privilege escalation
- Cross-tenant data access

**Mitigations**:
```
✓ Row-Level Security at database
✓ Scope-based API key permissions
✓ Role-based access control
✓ Resource ownership validation
```

### 2. OAuth Flow Attacks

#### 2.1 Authorization Code Interception

**Threat**: Attacker intercepts OAuth authorization code.

**Attack scenarios**:
- Malicious redirect URI
- MitM on callback
- Referrer leakage

**Mitigations**:
```
✓ Mandatory PKCE (S256)
✓ Exact redirect URI matching
✓ HTTPS only (no referrer leakage)
✓ Short-lived authorization codes
```

#### 2.2 CSRF in OAuth Flow

**Threat**: Attacker initiates OAuth for victim's session.

**Attack scenarios**:
- Login CSRF
- Account linking CSRF

**Mitigations**:
```
✓ Cryptographic state parameter
✓ State bound to session
✓ Single-use state tokens
✓ State expiration (10 minutes)
```

#### 2.3 Token Theft

**Threat**: Access or refresh tokens stolen.

**Attack scenarios**:
- Token leakage in logs
- Client-side XSS stealing tokens
- Database breach

**Mitigations**:
```
✓ Tokens encrypted at rest (AES-256-GCM)
✓ Tokens never logged
✓ Server-side token storage only
✓ Token rotation on use
```

### 3. Data Breaches

#### 3.1 Database Compromise

**Threat**: Attacker gains database access.

**Attack scenarios**:
- SQL injection leading to data dump
- Stolen database credentials
- Insider access

**Mitigations**:
```
✓ All credentials encrypted (AES-256-GCM)
✓ Database credentials in secrets manager
✓ Network segmentation (private subnet)
✓ RLS prevents cross-tenant access
✓ API keys hashed (not reversible)
```

#### 3.2 Key Compromise

**Threat**: Encryption keys leaked.

**Attack scenarios**:
- Environment variable exposure
- Compromised KMS
- Backup containing keys

**Mitigations**:
```
✓ Keys in KMS/HSM (not environment)
✓ Key rotation capability
✓ Envelope encryption (DEK/KEK)
✓ Key access audited
```

### 4. Infrastructure Attacks

#### 4.1 DDoS

**Threat**: Service availability impacted.

**Attack scenarios**:
- Volumetric attacks
- Application-layer attacks
- Resource exhaustion

**Mitigations**:
```
✓ CDN with DDoS protection
✓ Rate limiting at all layers
✓ Auto-scaling infrastructure
✓ Request size limits
```

#### 4.2 Supply Chain

**Threat**: Compromised dependencies.

**Attack scenarios**:
- Malicious npm packages
- Typosquatting attacks
- Compromised build process

**Mitigations**:
```
✓ Dependency scanning (Dependabot, Snyk)
✓ Lock file enforcement
✓ Private npm registry (Enterprise)
✓ Signed commits required
```

### 5. Social Engineering

#### 5.1 Phishing

**Threat**: Users tricked into revealing credentials.

**Attack scenarios**:
- Fake OAuth consent screens
- Credential harvesting emails
- Support impersonation

**Mitigations**:
```
✓ OAuth uses official provider screens
✓ Security awareness documentation
✓ MFA for sensitive operations
✓ Email verification for new accounts
```

## Risk Matrix

| Threat | Likelihood | Impact | Risk | Status |
|--------|------------|--------|------|--------|
| API Key Brute Force | Low | High | Medium | Mitigated |
| SQL Injection | Low | Critical | High | Mitigated |
| OAuth Code Interception | Medium | High | High | Mitigated |
| Database Breach | Low | Critical | High | Mitigated |
| Key Compromise | Low | Critical | High | Mitigated |
| DDoS | Medium | Medium | Medium | Mitigated |
| Supply Chain | Medium | High | High | Partially Mitigated |
| Insider Threat | Low | Critical | Medium | Partially Mitigated |

## Security Controls Summary

### Preventive Controls

| Control | Threats Addressed |
|---------|------------------|
| PKCE | Code interception |
| RLS | Cross-tenant access |
| Encryption | Data breach |
| Rate limiting | Brute force, DDoS |
| Input validation | Injection |

### Detective Controls

| Control | Purpose |
|---------|---------|
| Audit logging | Incident investigation |
| Anomaly detection | Breach detection |
| Dependency scanning | Supply chain |
| Security monitoring | Real-time threats |

### Corrective Controls

| Control | Purpose |
|---------|---------|
| Key rotation | Respond to key compromise |
| Token revocation | Respond to token theft |
| Account lockout | Stop brute force |
| Incident response | Handle security events |

## STRIDE Analysis

### Spoofing

| Threat | Mitigation |
|--------|------------|
| Impersonate user | Strong authentication, MFA |
| Impersonate service | TLS certificates, signature verification |
| Forge API key | 256-bit entropy, SHA-256 hash |

### Tampering

| Threat | Mitigation |
|--------|------------|
| Modify credentials | AES-GCM auth tag |
| Modify requests | Request signing |
| Modify database | Transaction logs, RLS |

### Repudiation

| Threat | Mitigation |
|--------|------------|
| Deny actions | Comprehensive audit logging |
| Forge logs | Append-only, signed logs |

### Information Disclosure

| Threat | Mitigation |
|--------|------------|
| Credential theft | Encryption at rest |
| Token leakage | Secure storage, no logging |
| Error messages | Generic errors, no stack traces |

### Denial of Service

| Threat | Mitigation |
|--------|------------|
| Resource exhaustion | Rate limiting |
| Traffic flood | CDN, auto-scaling |
| Slow requests | Request timeouts |

### Elevation of Privilege

| Threat | Mitigation |
|--------|------------|
| Bypass authorization | RLS, scope validation |
| Cross-tenant access | RLS, tenant context |
| Admin access | Role validation, MFA |

## Incident Response

### Severity Levels

| Level | Definition | Response Time |
|-------|------------|---------------|
| P0 | Active exploitation | Immediate |
| P1 | Critical vulnerability | 4 hours |
| P2 | High vulnerability | 24 hours |
| P3 | Medium vulnerability | 1 week |

### Response Procedures

1. **Detection**: Automated alerts or manual report
2. **Triage**: Assess severity and scope
3. **Containment**: Isolate affected systems
4. **Eradication**: Remove threat
5. **Recovery**: Restore normal operations
6. **Post-mortem**: Document and improve

### Communication

- **Internal**: Security team Slack channel
- **Customers**: Status page, email for affected users
- **Public**: Blog post for significant incidents
- **Regulators**: As required by law

## Security Testing

### Regular Testing

| Type | Frequency |
|------|-----------|
| Automated scans | Continuous (CI/CD) |
| Dependency audit | Daily |
| Penetration test | Annual |
| Security review | Per release |

### Bug Bounty

- Program: Coming soon
- Scope: API, OAuth flows, encryption
- Rewards: Based on severity
- Safe harbor: Yes

