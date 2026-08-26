'use client';

import { useState } from 'react';
import { Button, Notice } from '@/components/ui';

/**
 * Shows a generated password the one time it exists in readable form.
 *
 * The server stores only its argon2id hash, so this panel is the single moment anyone can read it —
 * hence the warning and the copy button rather than a quiet line of text.
 */
export function InitialPassword({ password, subject }: { password: string; subject: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the password stays on screen to be read manually.
      setCopied(false);
    }
  };

  return (
    <Notice tone="success">
      <strong>{subject}</strong> için parola: <code className="font-mono">{password}</code>{' '}
      <Button variant="ghost" type="button" onClick={() => void copy()}>
        {copied ? 'Kopyalandı' : 'Kopyala'}
      </Button>
      <span className="mt-1 block text-xs">
        Bu parola bir daha gösterilmeyecek. Kullanıcıya güvenli bir kanaldan iletin.
      </span>
    </Notice>
  );
}
