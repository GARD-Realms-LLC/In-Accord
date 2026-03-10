"use client";

import { useMemo, useState } from "react";
import { Smile } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface EmojiPickerProps {
	onChange: (value: string) => void;
	defaultEmoji?: string;
	favorites?: string[];
}

const RECENT_EMOJIS_LIMIT = 12;

const normalizeEmojiList = (value: unknown, fallback: string[]) => {
	if (!Array.isArray(value)) {
		return [...fallback];
	}

	const deduped = Array.from(
		new Set(
			value
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter((item) => item.length > 0)
				.slice(0, RECENT_EMOJIS_LIMIT)
		)
	);

	return deduped.length ? deduped : [...fallback];
};

export const EmojiPicker = ({ onChange, defaultEmoji = "😊", favorites = ["😀", "😂", "😍", "🔥", "👏", "🎉", "👍", "👀"] }: EmojiPickerProps) => {
	const [isOpen, setIsOpen] = useState(false);
	const [recentEmojis, setRecentEmojis] = useState<string[]>([]);

	const normalizedDefaultEmoji = useMemo(() => {
		const trimmed = String(defaultEmoji ?? "").trim();
		return trimmed.length ? trimmed : "😊";
	}, [defaultEmoji]);

	const normalizedFavorites = useMemo(
		() => normalizeEmojiList(favorites, ["😀", "😂", "😍", "🔥", "👏", "🎉", "👍", "👀"]),
		[favorites]
	);

	const chooseEmoji = (value: string) => {
		const normalized = String(value ?? "").trim();
		if (!normalized) {
			return;
		}

		onChange(normalized);
		setRecentEmojis((current) => {
			const next = [normalized, ...current.filter((item) => item !== normalized)].slice(0, RECENT_EMOJIS_LIMIT);
			return next;
		});
		setIsOpen(false);
	};

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="Insert emoji"
					className="rounded p-1 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600 dark:hover:text-white"
				>
					<Smile className="h-5 w-5" suppressHydrationWarning />
				</button>
			</PopoverTrigger>

			<PopoverContent
				side="top"
				align="end"
				className="w-72 border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
			>
				<div className="space-y-3">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
							Default
						</p>
						<button
							type="button"
							onClick={() => chooseEmoji(normalizedDefaultEmoji)}
							className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 text-xl transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
							title={`Insert ${normalizedDefaultEmoji}`}
						>
							{normalizedDefaultEmoji}
						</button>
					</div>

					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
							Favorites
						</p>
						<div className="mt-1 grid grid-cols-8 gap-1">
							{normalizedFavorites.map((emoji) => (
								<button
									key={`favorite-${emoji}`}
									type="button"
									onClick={() => chooseEmoji(emoji)}
									className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-base transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
									title={`Insert ${emoji}`}
								>
									{emoji}
								</button>
							))}
						</div>
					</div>

					{recentEmojis.length ? (
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
								Recent
							</p>
							<div className="mt-1 grid grid-cols-8 gap-1">
								{recentEmojis.map((emoji) => (
									<button
										key={`recent-${emoji}`}
										type="button"
										onClick={() => chooseEmoji(emoji)}
										className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-base transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
										title={`Insert ${emoji}`}
									>
										{emoji}
									</button>
								))}
							</div>
						</div>
					) : null}
				</div>
			</PopoverContent>
		</Popover>
	);
};
