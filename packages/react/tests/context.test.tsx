/**
 * Tests for AuthlaneProvider and useAuthlaneContext
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthlaneProvider, useAuthlaneContext } from '../src/context.js';

describe('AuthlaneProvider', () => {
  it('should provide context to children', () => {
    function TestComponent() {
      const { userId, publicKey } = useAuthlaneContext();
      return (
        <div>
          <span data-testid="userId">{userId}</span>
          <span data-testid="publicKey">{publicKey}</span>
        </div>
      );
    }

    render(
      <AuthlaneProvider publicKey="pk_test_123" userId="user_123">
        <TestComponent />
      </AuthlaneProvider>
    );

    expect(screen.getByTestId('userId').textContent).toBe('user_123');
    expect(screen.getByTestId('publicKey').textContent).toBe('pk_test_123');
  });

  it('should throw error when used outside provider', () => {
    function TestComponent() {
      try {
        useAuthlaneContext();
        return <div>Should not reach here</div>;
      } catch (error) {
        return <div>{(error as Error).message}</div>;
      }
    }

    render(<TestComponent />);

    expect(screen.getByText(/must be used within an AuthlaneProvider/i)).toBeTruthy();
  });

  it('should use default baseUrl', () => {
    function TestComponent() {
      const { baseUrl } = useAuthlaneContext();
      return <div data-testid="baseUrl">{baseUrl}</div>;
    }

    render(
      <AuthlaneProvider publicKey="pk_test_123" userId="user_123">
        <TestComponent />
      </AuthlaneProvider>
    );

    expect(screen.getByTestId('baseUrl').textContent).toBe('https://api.authlane.com');
  });

  it('should allow custom baseUrl', () => {
    function TestComponent() {
      const { baseUrl } = useAuthlaneContext();
      return <div data-testid="baseUrl">{baseUrl}</div>;
    }

    render(
      <AuthlaneProvider publicKey="pk_test_123" userId="user_123" baseUrl="https://custom.api.com">
        <TestComponent />
      </AuthlaneProvider>
    );

    expect(screen.getByTestId('baseUrl').textContent).toBe('https://custom.api.com');
  });
});
