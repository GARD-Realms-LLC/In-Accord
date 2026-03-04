"use client";

import { Smile } from "lucide-react";

interface EmojiPickerProps {
	onChange: (value: string) => void;
}

export const EmojiPicker = ({ onChange }: EmojiPickerProps) => {
	return (
		<button
			type="button"
			aria-label="Insert emoji"
			onClick={() => onChange("😊")}
			className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
		>
			<Smile className="h-5 w-5" />
		</button>
	);
};
