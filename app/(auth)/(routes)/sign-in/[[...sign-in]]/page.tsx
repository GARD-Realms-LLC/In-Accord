import { SignInForm } from "@/components/auth/sign-in-form";
import { INACCORD_BUILD_NUMBER, INACCORD_VERSION_LABEL } from "@/lib/build-version";

export default function Page() {
  return <SignInForm buildNumber={INACCORD_BUILD_NUMBER} versionLabel={INACCORD_VERSION_LABEL} />;
}