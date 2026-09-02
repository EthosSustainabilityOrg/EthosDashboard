'use client';

import { useMemo, useState } from 'react';
import type { ContactType, FundraisingContact } from '@/types/fundraising';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { ContactCard } from '@/components/fundraising/ContactCard';

type ContactFilter = 'All' | ContactType;

type ContactListProps = {
  contacts: FundraisingContact[];
  isBoard: boolean;
  onAdd: () => void;
  onEdit: (contact: FundraisingContact) => void;
  onDeleted: (contactId: string) => void;
};

const filters: ContactFilter[] = ['All', 'Donor', 'Partner', 'Sponsor', 'Other'];

function matchesContact(contact: FundraisingContact, search: string, filter: ContactFilter) {
  const term = search.trim().toLowerCase();
  return (
    (filter === 'All' || contact.type === filter) &&
    (!term ||
      contact.name.toLowerCase().includes(term) ||
      (contact.email ?? '').toLowerCase().includes(term))
  );
}

export function ContactList({ contacts, isBoard, onAdd, onEdit, onDeleted }: ContactListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ContactFilter>('All');

  const filteredContacts = useMemo(
    () => contacts.filter((contact) => matchesContact(contact, search, filter)),
    [contacts, search, filter],
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-bold text-espresso">Contacts & Partners</h2>
        {isBoard ? (
          <Button variant="primary" size="sm" onClick={onAdd}>
            Add Contact
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border border-sand bg-cream p-5">
        <div className="mb-4">
          <Input value={search} onChange={setSearch} ariaLabel="Search contacts" placeholder="Search contacts..." name="contact-search" />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <Chip key={item} label={item} active={filter === item} onClick={() => setFilter(item)} />
          ))}
        </div>
      </div>

      {filteredContacts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredContacts.map((contact) => (
            <ContactCard
              key={contact.contact_id}
              contact={contact}
              isBoard={isBoard}
              onEdit={onEdit}
              onDelete={onDeleted}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-sand bg-cream px-5 py-10 text-center text-sm text-warm-gray">
          No contacts found
        </p>
      )}
    </section>
  );
}
