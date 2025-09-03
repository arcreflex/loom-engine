import { ReactElement } from 'react';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';
import { render } from '@testing-library/react';

export function renderWithRouter(
  ui: ReactElement,
  routerProps: MemoryRouterProps = { initialEntries: ['/'] }
) {
  return render(<MemoryRouter {...routerProps}>{ui}</MemoryRouter>);
}
