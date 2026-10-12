'use client';

import { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface DisabledReasonProps {
  /** Why the wrapped control is disabled; when undefined the children render untouched. */
  reason?: string;
  children: ReactNode;
  /** Set false inside menus, where the menu already owns keyboard focus. */
  focusable?: boolean;
}

/**
 * Explains a disabled control. Disabled elements emit no pointer or focus events, so the tooltip hangs off a wrapper
 * that stays hoverable and (outside menus) keyboard-focusable.
 */
export function DisabledReason({ reason, children, focusable = true }: DisabledReasonProps): React.JSX.Element {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={focusable ? 0 : undefined} data-slot="disabled-reason">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
