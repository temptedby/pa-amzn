"use client";

import { useFormStatus } from "react-dom";
import clsx from "clsx";

interface SubmitButtonProps {
  children: React.ReactNode;
  pendingLabel?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
}

export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  className,
  title,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      title={title}
      className={clsx(className, (pending || disabled) && "opacity-60 cursor-not-allowed")}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
