import { toast } from 'sonner';

export interface NotifyOptions {
  /** Same id replaces the existing toast instead of stacking a duplicate. */
  id?: string;
  description?: string;
  duration?: number;
}

type Level = 'success' | 'error' | 'warning' | 'info';

function show(level: Level, message: string, options: NotifyOptions = {}): void {
  toast[level](message, { id: options.id ?? `${level}:${message}`, description: options.description, duration: options.duration });
}

/** The only way the app shows a toast. Four levels, deduplicated by default. */
export const notify = {
  success: (message: string, options?: NotifyOptions): void => show('success', message, options),
  error: (message: string, options?: NotifyOptions): void => show('error', message, options),
  warning: (message: string, options?: NotifyOptions): void => show('warning', message, options),
  info: (message: string, options?: NotifyOptions): void => show('info', message, options),
  /** Removes a toast that was shown with a known id (e.g. a progress notice that is no longer true). */
  dismiss: (id: string): void => {
    toast.dismiss(id);
  },
};
