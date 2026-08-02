import type { Metadata } from "next";
import SignupForm from "./SignupForm";

export const metadata: Metadata = {
  title: "Create your account — Co-VideoPro",
};

export default function SignupPage() {
  return <SignupForm />;
}
