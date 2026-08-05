import { useId, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toastSuccess } from '@/lib/toast';
import ErrorNotice from './ErrorNotice';
import Button from './ui/Button';
import Dialog from './ui/Dialog';
import { TextField } from './ui/Field';

interface CreateOrganizationModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateOrganizationModal({
  onClose,
  onSuccess,
}: CreateOrganizationModalProps) {
  const { createOrganization, switchOrganization } = useAuth();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    // Generate slug from name
    const generatedSlug = value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    setSlug(generatedSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const org = await createOrganization(name.trim(), slug.trim());
      // Automatically switch to the new organization
      await switchOrganization(org.id);
      toastSuccess(`${name.trim()} created`, 'You are now working in the new organization.');
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Create Organization"
      description="A separate workspace with its own services, keys and members."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            isPending={isLoading}
            disabled={!name.trim() || !slug.trim()}
          >
            {isLoading ? 'Creating...' : 'Create Organization'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorNotice error={error} />}

        <TextField
          id="org-name"
          label="Organization Name"
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="e.g., My Company"
          required
        />

        <TextField
          id="org-slug"
          label="Organization Slug"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          placeholder="e.g., my-company"
          required
          pattern="^[a-z0-9-]+$"
          hint="URL-friendly identifier (lowercase letters, numbers, and hyphens only)"
        />
      </form>
    </Dialog>
  );
}
