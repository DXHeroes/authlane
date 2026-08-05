import type { ReactNode } from 'react';
import type { Connection } from '@/types';
import Badge, { connectionTone } from './ui/Badge';
import Button from './ui/Button';
import Dialog from './ui/Dialog';

interface ConnectionDetailModalProps {
  connection: Connection;
  onClose: () => void;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all text-sm">{children}</dd>
    </div>
  );
}

export default function ConnectionDetailModal({ connection, onClose }: ConnectionDetailModalProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Connection Details"
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <dl className="space-y-4">
        <Detail label="Connection ID">
          <span className="font-mono">{connection.id}</span>
        </Detail>

        <div className="grid gap-4 sm:grid-cols-2">
          <Detail label="User ID">
            <span className="font-mono">{connection.externalUserId}</span>
          </Detail>
          <Detail label="Service">{connection.serviceId}</Detail>
        </div>

        <Detail label="Status">
          <Badge tone={connectionTone(connection.status)}>{connection.status}</Badge>
        </Detail>

        <div className="grid gap-4 sm:grid-cols-2">
          <Detail label="Created At">{new Date(connection.createdAt).toLocaleString()}</Detail>
          <Detail label="Updated At">{new Date(connection.updatedAt).toLocaleString()}</Detail>
        </div>

        {connection.lastHealthCheck && (
          <Detail label="Last Health Check">
            {new Date(connection.lastHealthCheck).toLocaleString()}
          </Detail>
        )}
      </dl>

      <p className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
        Credentials are only issued to scoped server-side API keys and never enter the dashboard
        browser.
      </p>
    </Dialog>
  );
}
