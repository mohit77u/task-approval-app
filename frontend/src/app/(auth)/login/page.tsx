'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ServerStatusBanner } from '@/components/layout/ServerStatusBanner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { applyFieldErrors, useApiAction } from '@/hooks/useApiAction';
import { DEMO_ACCOUNTS } from '@/lib/demoAccounts';
import { useLoginMutation, useMeQuery } from '@/services/api/authApi';
import { useAppSelector } from '@/store/hooks';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const status = useAppSelector((state) => state.auth.status);
  const [login] = useLoginMutation();
  const { run, isPending } = useApiAction();
  // Detects an existing session (and wakes a sleeping backend) while the form is already usable.
  useMeQuery(undefined, { skip: status !== 'loading' });

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  const onSubmit = async (values: FormValues): Promise<void> => {
    const result = await run(() => login(values).unwrap());
    if (result.ok) router.replace('/dashboard');
    else applyFieldErrors(result.error, form.setError, ['email', 'password']);
  };

  return (
    <>
      <ServerStatusBanner />
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Task &amp; Approval</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to manage and approve tasks.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use your work email and password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="username" aria-invalid={Boolean(form.formState.errors.email)} {...form.register('email')} />
                {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" aria-invalid={Boolean(form.formState.errors.password)} {...form.register('password')} />
                {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Demo accounts</CardTitle>
            <CardDescription>Click an account to fill the form, then sign in.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <Button
                key={account.email}
                type="button"
                variant="outline"
                className="h-auto w-full justify-between py-2 text-left"
                onClick={() => form.reset({ email: account.email, password: account.password })}
              >
                <span>
                  <span className="block text-sm font-medium">{account.label}</span>
                  <span className="block text-xs text-muted-foreground">{account.email}</span>
                </span>
                <span className="text-xs text-muted-foreground">{account.name}</span>
              </Button>
            ))}
            <p className="pt-2 text-xs text-muted-foreground">
              Sessions are shared by tabs of one browser. To try two roles at once, sign in as the second user in a private/incognito window or another browser.
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
