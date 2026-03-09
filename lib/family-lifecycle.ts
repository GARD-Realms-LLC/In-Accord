export type FamilyLifecycleState = {
  age: number | null;
  isFamilyLinked: boolean;
  showFamilyIcon: boolean;
  canConvertToNormal: boolean;
  shouldAutoConvert: boolean;
};

const parseDateOfBirth = (value: string | null | undefined) => {
  const input = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return null;
  }

  const [yearPart, monthPart, dayPart] = input.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const parsed = new Date(`${input}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const calculateAge = (dateOfBirth: string | null | undefined, now = new Date()) => {
  const parsedDate = parseDateOfBirth(dateOfBirth);

  if (!parsedDate) {
    return null;
  }

  const birthYear = parsedDate.getUTCFullYear();
  const birthMonth = parsedDate.getUTCMonth();
  const birthDay = parsedDate.getUTCDate();

  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const currentDay = now.getUTCDate();

  let age = currentYear - birthYear;
  const hasNotReachedBirthday =
    currentMonth < birthMonth ||
    (currentMonth === birthMonth && currentDay < birthDay);

  if (hasNotReachedBirthday) {
    age -= 1;
  }

  return age >= 0 ? age : null;
};

export const getFamilyLifecycleState = (
  dateOfBirth: string | null | undefined,
  familyParentUserId: string | null | undefined
): FamilyLifecycleState => {
  const normalizedParentUserId = String(familyParentUserId ?? "").trim();
  const age = calculateAge(dateOfBirth);
  const isFamilyLinked = normalizedParentUserId.length > 0;

  if (!isFamilyLinked) {
    return {
      age,
      isFamilyLinked: false,
      showFamilyIcon: false,
      canConvertToNormal: false,
      shouldAutoConvert: false,
    };
  }

  const isUnder16 = age !== null ? age < 16 : true;
  const isAtLeast16 = age !== null && age >= 16;
  const isAtLeast18 = age !== null && age >= 18;

  return {
    age,
    isFamilyLinked: true,
    showFamilyIcon: isUnder16,
    canConvertToNormal: isAtLeast16,
    shouldAutoConvert: isAtLeast18,
  };
};

export const normalizeFamilyLinkStateLabel = (
  lifecycle: FamilyLifecycleState
): "managed-under-16" | "eligible-16-plus" | "normal" => {
  if (!lifecycle.isFamilyLinked) {
    return "normal";
  }

  if (lifecycle.showFamilyIcon) {
    return "managed-under-16";
  }

  return "eligible-16-plus";
};