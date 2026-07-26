'use client';

import type * as React from 'react';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  async function handleGoogleSignIn() {
    setIsGoogleLoading(true);

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    );

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });

    if (error) {
      setIsGoogleLoading(false);
    }
  }

  function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-espresso">Welcome back</h1>
        <p className="mt-2 text-sm text-warm-gray">Sign in to continue</p>
      </div>

      <div className="space-y-5">
        <Button
          variant="primary"
          size="lg"
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading}
          className="w-full"
        >
          <span className="mr-2 font-bold">G</span>
          {isGoogleLoading ? 'Redirecting...' : 'Continue with Google'}
        </Button>

        <div className="relative flex items-center">
          <div className="h-px flex-1 bg-sand" />
          <span className="px-3 text-xs font-semibold text-warm-gray">or</span>
          <div className="h-px flex-1 bg-sand" />
        </div>

        <form className="space-y-4" onSubmit={handleEmailSubmit}>
          <Input
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="Email address"
            name="email"
          />

          <Button variant="secondary" size="lg" type="submit" className="w-full">
            Sign in with email
          </Button>
        </form>

        <p className="text-center text-xs leading-5 text-warm-gray">
          New to Ethos? Just sign in — you'll be guided from there.
        </p>
      </div>
    </div>
  );
}
