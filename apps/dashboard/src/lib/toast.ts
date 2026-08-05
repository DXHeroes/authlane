import { toast } from 'sonner';
import { errorHint, errorMessage } from './error-message';

/**
 * Confirms an action in the same words as the control that started it: the button says
 * "Revoke", this says "API key revoked". Nothing says "Success!".
 */
export function toastSuccess(message: string, description?: string) {
  toast.success(message, { description });
}

/**
 * Reports a failure with everything the API said about it — the message, and the hint
 * naming the fix. Dropping the hint is dropping the half that says what to do.
 */
export function toastError(error: unknown, fallback = 'Something went wrong.') {
  toast.error(errorMessage(error, fallback), { description: errorHint(error) });
}
