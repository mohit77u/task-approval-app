import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}): React.JSX.Element {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
      <p className="font-medium">{title}</p>
      {message && <p className="max-w-sm text-sm text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
