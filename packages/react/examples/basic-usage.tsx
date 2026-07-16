import { AuthlaneConnect } from '@authlane/react';

export default function IntegrationSettings({ connectUrl }: { connectUrl: string }) {
  return (
    <AuthlaneConnect
      connectUrl={connectUrl}
      minHeight={480}
      onEvent={(event) => console.log(event)}
    />
  );
}
