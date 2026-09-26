// Internal logging. A full phone number must never reach a log (.agents/rules/security.md), and
// database errors can quote query arguments, so every message is masked on the way out.

const PHONE = /\+234(\d{7})(\d{3})/g;

/** `+2348031234567` → `+234*******567`. */
export function maskPhones(text: string): string {
  return text.replace(
    PHONE,
    (_match, hidden: string, last: string) => `+234${'*'.repeat(hidden.length)}${last}`,
  );
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`;
  return String(err);
}

export const log = {
  error(message: string, context: { err: unknown }): void {
    console.error(maskPhones(`${message}\n${describe(context.err)}`));
  },
};
