'use client';

import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** Adds a note box. When `required`, Confirm stays disabled until it has text. */
  note?: { label: string; required: boolean; placeholder?: string };
}

export interface ConfirmResult {
  confirmed: boolean;
  note: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [note, setNote] = useState('');
  const resolver = useRef<((result: ConfirmResult) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    // A second call while a dialog is open would orphan the first promise; settle it as cancelled.
    resolver.current?.({ confirmed: false, note: '' });
    setNote('');
    setOptions(next);
    return new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (confirmed: boolean): void => {
    resolver.current?.({ confirmed, note: note.trim() });
    resolver.current = null;
    setOptions(null);
  };

  const noteMissing = Boolean(options?.note?.required) && note.trim().length === 0;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={options !== null} onOpenChange={(open) => !open && settle(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{options?.title}</DialogTitle>
            {options?.description && (
              <DialogDescription asChild>
                <div>{options.description}</div>
              </DialogDescription>
            )}
          </DialogHeader>
          {options?.note && (
            <div className="space-y-2">
              {/* Only mark the note required when Confirm is actually gated on it. */}
              <Label htmlFor="confirm-note" required={options.note.required}>
                {options.note.label}
              </Label>
              <Textarea
                id="confirm-note"
                required={options.note.required}
                value={note}
                maxLength={1000}
                placeholder={options.note.placeholder}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => settle(false)}>
              Cancel
            </Button>
            <Button variant={options?.destructive ? 'destructive' : 'default'} disabled={noteMissing} onClick={() => settle(true)}>
              {options?.confirmLabel ?? 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
}
