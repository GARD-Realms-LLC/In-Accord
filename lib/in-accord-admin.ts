export const isInAccordAdministrator = (role: string | null | undefined) => {
  const normalizedRole = (role ?? "").trim().toUpperCase();

  return (
    normalizedRole === "ADMINISTRATOR" ||
    normalizedRole === "IN-ACCORD ADMINISTRATOR" ||
    normalizedRole === "IN_ACCORD_ADMINISTRATOR" ||
    normalizedRole === "ADMIN"
  );
};
