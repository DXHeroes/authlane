'use client';

import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import { authlaneScalarConfig } from './api-reference-config';

export function ApiReferenceClient() {
  return <ApiReferenceReact configuration={authlaneScalarConfig} />;
}
