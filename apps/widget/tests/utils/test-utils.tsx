import { type RenderOptions, render } from '@testing-library/react';
import type { ReactElement } from 'react';

// Custom render for widget (no providers needed for now)
export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  return render(ui, options);
}

// Re-export everything
export * from '@testing-library/react';
export { renderWithProviders as render };
