'use client';

import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { ContactType, FundraisingContact } from '@/types/fundraising';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';

type ContactFormSheetProps = {
  contact: FundraisingContact | null;
  onClose: () => void;
  onSaved: (contact: FundraisingContact) => void;
};

type ContactResponse = {
  data: FundraisingContact | null;
  error: { message: string } | null;
};

const contactTypes: ContactType[] = ['Donor', 'Partner', 'Sponsor', 'Other'];

export function ContactFormSheet({ contact, onClose, onSaved }: ContactFormSheetProps) {
  const [name, setName] = useState(contact?.name ?? '');
  const [type, setType] = useState<ContactType>(contact?.type ?? 'Donor');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    setIsSaving(true);
    setError(null);

    const response = await fetch(
      contact ? `/api/fundraising-contacts/${contact.contact_id}` : '/api/fundraising-contacts',
      {
        method: contact ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          type,
          email: email.trim() || null,
          phone: phone.trim() || null,
          notes: notes.trim() || null,
        }),
      },
    );

    const body = (await response.json()) as ContactResponse;
    setIsSaving(false);

    if (!response.ok || body.error || !body.data) {
      setError(body.error?.message ?? 'Unable to save contact.');
      return;
    }

    onSaved(body.data);
  }

  return (
    <>
      <button type="button" aria-label="Close contact sheet" className="fixed inset-0 z-40 bg-espresso/20" onClick={onClose} />
      <section className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-cream p-6 shadow-lg">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-bold text-espresso">{contact ? 'Edit Contact' : 'Add Contact'}</h2>
            <button type="button" className="text-2xl leading-none text-warm-gray" onClick={onClose}>x</button>
          </div>

          <Input label="Name" value={name} onChange={setName} name="contact-name" required />
          <Select
            label="Type"
            value={type}
            onChange={(value) => setType(value as ContactType)}
            options={contactTypes.map((item) => ({ value: item, label: item }))}
            required
          />
          <Input label="Email" type="email" value={email} onChange={setEmail} name="contact-email" />
          <Input label="Phone" type="tel" value={phone} onChange={setPhone} name="contact-phone" />
          <Textarea label="Notes" value={notes} onChange={setNotes} name="contact-notes" />

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose} disabled={isSaving}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Contact'}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
