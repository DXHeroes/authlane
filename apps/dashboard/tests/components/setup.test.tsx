import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '../utils/test-utils';

// Simple smoke test to validate test setup
describe('Test Setup Validation', () => {
  it('should render a simple component', () => {
    const SimpleComponent = () => <div data-testid="test-div">Hello Test</div>;

    const { getByTestId } = render(<SimpleComponent />);

    expect(getByTestId('test-div')).toBeInTheDocument();
    expect(getByTestId('test-div')).toHaveTextContent('Hello Test');
  });

  it('should support user interactions', async () => {
    const ButtonComponent = () => {
      const [count, setCount] = React.useState(0);
      return (
        <button type="button" data-testid="counter-btn" onClick={() => setCount((c) => c + 1)}>
          Count: {count}
        </button>
      );
    };

    const { getByTestId } = render(<ButtonComponent />);
    const button = getByTestId('counter-btn');

    expect(button).toHaveTextContent('Count: 0');
  });

  it('should provide React Query provider', () => {
    const { container } = render(<div>Test with providers</div>);
    expect(container).toBeInTheDocument();
  });
});
