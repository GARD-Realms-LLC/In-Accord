export type MentionEntityType = "user" | "role";

export interface MentionOption {
  id: string;
  label: string;
  type: MentionEntityType;
}

export type MentionSegment =
  | {
      kind: "text";
      value: string;
    }
  | {
      kind: "mention";
      label: string;
      entityId: string;
      entityType: MentionEntityType;
      raw: string;
    };

const mentionTokenRegex = /@\[(.+?)\]\((user|role):([^)]+)\)/g;

export const MENTION_SETTINGS_KEY = "inaccord_mentions_enabled";

let mentionsEnabledCache = true;

export const buildMentionToken = (option: MentionOption) => {
  return `@[${option.label}](${option.type}:${option.id})`;
};

export const parseMentionSegments = (content: string): MentionSegment[] => {
  if (!content) {
    return [];
  }

  const segments: MentionSegment[] = [];
  let lastIndex = 0;

  const regex = new RegExp(mentionTokenRegex.source, "g");
  let match = regex.exec(content);

  while (match) {
    const start = match.index ?? 0;
    const end = start + match[0].length;

    if (start > lastIndex) {
      segments.push({
        kind: "text",
        value: content.slice(lastIndex, start),
      });
    }

    segments.push({
      kind: "mention",
      label: match[1],
      entityType: match[2] as MentionEntityType,
      entityId: match[3],
      raw: match[0],
    });

    lastIndex = end;

    match = regex.exec(content);
  }

  if (lastIndex < content.length) {
    segments.push({
      kind: "text",
      value: content.slice(lastIndex),
    });
  }

  if (segments.length === 0) {
    return [{ kind: "text", value: content }];
  }

  return segments;
};

export const readMentionsEnabled = () => {
  return mentionsEnabledCache;
};

export const writeMentionsEnabled = (enabled: boolean) => {
  mentionsEnabledCache = enabled;
};