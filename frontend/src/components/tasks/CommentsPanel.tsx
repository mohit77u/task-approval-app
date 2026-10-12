'use client';

import { Loader2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useApiAction } from '@/hooks/useApiAction';
import { formatRelative } from '@/lib/dates';
import { initialsOf } from '@/lib/text';
import { useCreateCommentMutation, useListCommentsQuery } from '@/services/api/commentsApi';

const MAX_LENGTH = 2000;

export function CommentsPanel({ taskId }: { taskId: number }): React.JSX.Element {
  const comments = useListCommentsQuery(taskId);
  const [createComment] = useCreateCommentMutation();
  const { run, isPending } = useApiAction();
  const [body, setBody] = useState('');

  const canSubmit = body.trim().length > 0 && !isPending;

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;
    const result = await run(() => createComment({ taskId, body: body.trim() }).unwrap());
    if (result.ok) setBody('');
  };

  return (
    <div className="space-y-6">
      {comments.isError ? (
        <ErrorState message={comments.error.message} onRetry={() => void comments.refetch()} />
      ) : !comments.data ? (
        <Skeleton className="h-24 w-full" />
      ) : comments.data.length === 0 ? (
        <EmptyState title="No comments yet" description="Start the conversation below." />
      ) : (
        <ul className="space-y-4" aria-label="Comments">
          {comments.data.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">{initialsOf(comment.author.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{comment.author.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{formatRelative(comment.createdAt)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{comment.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(event) => void onSubmit(event)} className="space-y-2">
        <label htmlFor="new-comment" className="text-sm font-medium">
          Add a comment
        </label>
        <Textarea id="new-comment" rows={3} disabled={isPending} maxLength={MAX_LENGTH} value={body} onChange={(event) => setBody(event.target.value)} />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {body.length}/{MAX_LENGTH}
          </span>
          <Button type="submit" disabled={!canSubmit}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Add comment
          </Button>
        </div>
      </form>
    </div>
  );
}
