import {
  isInAccordAdministrator,
  isInAccordDeveloper,
  isInAccordModerator,
} from "@/lib/in-accord-admin";

export type ProfileIcon = {
  key: string;
  label: string;
  shortLabel: string;
  emoji?: string;
};

type ProfileIconRuleContext = {
  userId?: string | null;
  role?: string | null;
  email?: string | null;
  createdAt?: Date | string | null;
};

type ProfileIconRule = {
  icon: ProfileIcon;
  isEarned: (context: ProfileIconRuleContext) => boolean;
};

const profileIconRules: ProfileIconRule[] = [
  {
    icon: {
      key: "beta",
      label: "Beta Tester",
      shortLabel: "BETA",
      emoji: "🧪",
    },
    isEarned: () => true,
  },
  {
    icon: {
      key: "administrator",
      label: "Administrator",
      shortLabel: "ADMIN",
      emoji: "👑",
    },
    isEarned: (context) => isInAccordAdministrator(context.role),
  },
  {
    icon: {
      key: "moderator",
      label: "Moderator",
      shortLabel: "MOD",
      emoji: "🛡️",
    },
    isEarned: (context) => isInAccordModerator(context.role),
  },
  {
    icon: {
      key: "developer",
      label: "Developer",
      shortLabel: "DEV",
      emoji: "🛠️",
    },
    isEarned: (context) => isInAccordDeveloper(context.role),
  },
];

export const resolveProfileIcons = (context: ProfileIconRuleContext): ProfileIcon[] => {
  return profileIconRules
    .filter((rule) => {
      try {
        return rule.isEarned(context);
      } catch {
        return false;
      }
    })
    .map((rule) => rule.icon);
};
