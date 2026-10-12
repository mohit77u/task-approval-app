import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL, STATUS_ORDER } from '@/lib/constants';
import type { TaskFilters } from '@/services/api/tasksApi';
import { User } from '@/types/api';

const ALL = 'ALL';

interface FilterSelectProps {
  label: string;
  placeholder: string;
  value: string | undefined;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string | undefined) => void;
}

/** Radix Select cannot hold an empty value, so "no filter" is represented by a sentinel and mapped back to undefined. */
function FilterSelect({ label, placeholder, value, options, onChange }: FilterSelectProps): React.JSX.Element {
  return (
    <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? undefined : next)}>
      <SelectTrigger aria-label={label} className="w-full sm:w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface TaskFilterBarProps {
  filters: TaskFilters;
  searchInput: string;
  onSearchChange: (value: string) => void;
  onFilterChange: (key: 'status' | 'priority' | 'assigneeId', value: string | number | undefined) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
  /** Present only for admins. */
  employees?: User[];
}

export function TaskFilterBar({ filters, searchInput, onSearchChange, onFilterChange, onReset, hasActiveFilters, employees }: TaskFilterBarProps): React.JSX.Element {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label="Search tasks"
          placeholder="Search by title…"
          className="pl-9"
          maxLength={100}
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <FilterSelect
        label="Status"
        placeholder="All statuses"
        value={filters.status}
        options={STATUS_ORDER.map((status) => ({ value: status, label: STATUS_LABEL[status] }))}
        onChange={(value) => onFilterChange('status', value)}
      />
      <FilterSelect
        label="Priority"
        placeholder="All priorities"
        value={filters.priority}
        options={PRIORITY_ORDER.map((priority) => ({ value: priority, label: PRIORITY_LABEL[priority] }))}
        onChange={(value) => onFilterChange('priority', value)}
      />
      {employees && (
        <FilterSelect
          label="Employee"
          placeholder="All employees"
          value={filters.assigneeId ? String(filters.assigneeId) : undefined}
          options={employees.map((employee) => ({ value: String(employee.id), label: employee.name }))}
          onChange={(value) => onFilterChange('assigneeId', value ? Number(value) : undefined)}
        />
      )}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <X className="mr-1 h-4 w-4" aria-hidden />
          Reset
        </Button>
      )}
    </div>
  );
}
