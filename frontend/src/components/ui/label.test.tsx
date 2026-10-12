import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

describe('Label', () => {
  it('shows an aria-hidden asterisk that does not change the accessible name', () => {
    render(
      <>
        <Label htmlFor="t" required>
          Title
        </Label>
        <Input id="t" required />
      </>,
    );
    // Role query uses the real accessible-name computation, which skips aria-hidden content (getByLabelText matches raw text).
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeInTheDocument();
    const mark = document.querySelector('[data-slot="required-mark"]');
    expect(mark).toHaveTextContent('*');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders no asterisk when not required', () => {
    render(<Label htmlFor="p">Phone</Label>);
    expect(document.querySelector('[data-slot="required-mark"]')).toBeNull();
  });
});
