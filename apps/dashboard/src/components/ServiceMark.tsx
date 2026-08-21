import { useState } from 'react';

interface ServiceMarkProps {
  service: { name: string; iconUrl: string | null; brandColor: string | null; initials: string };
  /** Tailwind size classes, since the grid card and the detail header draw this at two sizes. */
  className?: string;
}

/**
 * A service's own mark, or its initials over its brand colour.
 *
 * The dashboard used to slice two letters off the name, which read as GI for GitHub and gave all
 * three Microsoft services MI. Both the mark and the initials come from the catalogue now, so this
 * shows a tenant exactly what their own users will see in hosted connect.
 */
export function ServiceMark({ service, className = 'size-10 text-sm' }: ServiceMarkProps) {
  const [failed, setFailed] = useState(false);

  if (service.iconUrl && !failed) {
    return (
      <img
        src={service.iconUrl}
        alt=""
        className={`${className} shrink-0 rounded-lg bg-white object-contain p-1.5`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${className} grid shrink-0 place-items-center rounded-lg font-bold ${
        service.brandColor ? 'text-white' : 'bg-primary/10 text-primary'
      }`}
      style={service.brandColor ? { background: service.brandColor } : undefined}
    >
      {service.initials}
    </div>
  );
}
