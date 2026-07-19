'use client';

import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import { useEffect } from 'react';
import { authlaneScalarConfig } from './api-reference-config';
import { observeReadOnlyApiReference } from './api-reference-readonly';

export function ApiReferenceClient() {
  useEffect(() => observeReadOnlyApiReference(document.body), []);

  return <ApiReferenceReact configuration={authlaneScalarConfig} />;
}
