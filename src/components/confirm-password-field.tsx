"use client";

import { Field, Input } from "@/components/ui";

// Password box for "confirm with your password" dialogs.
//
// Chrome's password manager fills the saved username into whatever text field
// sits before a password box — on the inventory page that was the search box, so
// opening a confirm dialog silently filtered the table down to "No matches". This
// gives Chrome its own (visually hidden) username field to fill instead, inside a
// form of its own, so nothing on the page behind the dialog is touched.
export function ConfirmPasswordField({
  value,
  onChange,
  onEnter,
  label = "Enter your password to confirm",
}: {
  value: string;
  onChange: (value: string) => void;
  /** Pressing Enter in the box. */
  onEnter: () => void;
  label?: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onEnter();
      }}
    >
      <input
        type="text"
        name="username"
        autoComplete="username"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        defaultValue=""
      />
      <Field label={label}>
        <Input
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    </form>
  );
}
