import { Badge } from '@/components/ui/badge';
import { PRIORITY_LABEL, PRIORITY_STYLES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { TaskPriority } from '@/types/api';

export function PriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }): React.JSX.Element {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap font-medium', PRIORITY_STYLES[priority], className)}>
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}
