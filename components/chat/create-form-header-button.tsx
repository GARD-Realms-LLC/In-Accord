"use client";

import { useModal } from "@/hooks/use-modal-store";

type CreateFormHeaderButtonProps = {
  className?: string;
};

export const CreateFormHeaderButton = ({ className }: CreateFormHeaderButtonProps) => {
  const { onOpen } = useModal();

  return (
    <button
      type="button"
      onClick={() => onOpen("createForm")}
      className={`${className ?? ""} inline-flex items-center rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800`}
    >
      Create Form
    </button>
  );
};
