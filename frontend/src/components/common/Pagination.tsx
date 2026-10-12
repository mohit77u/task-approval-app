import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  /** Singular name of the listed thing, used in "12 tasks". */
  noun?: string;
}

export function Pagination({ page, totalPages, total, onPageChange, disabled, noun = 'task' }: PaginationProps): React.JSX.Element {
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-4">
      <p className="text-sm text-muted-foreground">
        {total} {total === 1 ? noun : `${noun}s`} · Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
          <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
