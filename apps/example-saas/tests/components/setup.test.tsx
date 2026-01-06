import { describe, expect, it } from 'vitest';
import { render } from '../utils/test-utils';

// Simple smoke test to validate test setup
describe('Example-SaaS Test Setup Validation', () => {
  it('should render a simple component', () => {
    const SimpleComponent = () => <div data-testid="test-div">Hello Example-SaaS</div>;

    const { getByTestId } = render(<SimpleComponent />);

    expect(getByTestId('test-div')).toBeInTheDocument();
    expect(getByTestId('test-div')).toHaveTextContent('Hello Example-SaaS');
  });
});
