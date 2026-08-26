'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { errorMessage } from '@/lib/api-client';
import { systemAuthApi } from '@/lib/endpoints';
import { Button, Card, Field, Input, Notice } from '@/components/ui';

export default function SystemLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await systemAuthApi.login({ email: email.trim().toLowerCase(), password });
      // The session arrives as its own HttpOnly cookie, separate from any venue session.
      router.replace('/system/settings');
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <p className="mb-6 text-center text-2xl font-black tracking-tight">
        <span className="text-brand-400">Mood</span>isto
      </p>
      <Card className="space-y-4">
        <div>
          <h1 className="text-xl font-bold">Sistem girişi</h1>
          <p className="mt-1 text-sm text-muted">
            Kurulum ayarlarını yönetmek için sistem hesabınla giriş yap.
          </p>
        </div>

        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <Field label="E-posta">
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Parola">
            <Input
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          {error ? <Notice>{error}</Notice> : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </Button>
        </form>
      </Card>
      <Link href="/" className="mt-6 text-center text-sm text-muted hover:text-white">
        Ana sayfaya dön
      </Link>
    </div>
  );
}
