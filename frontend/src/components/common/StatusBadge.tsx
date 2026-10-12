import { Badge } from '@/components/ui/badge';
import { STATUS_LABEL, STATUS_STYLES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { TaskStatus } from '@/types/api';

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }): React.JSX.Element {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', STATUS_STYLES[status], className)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
