import type { Metadata } from "next";
import AuthPage from "@/components/AuthPage";

export const metadata: Metadata = { title: "Create account" };
export default function SignupPage() { return <AuthPage mode="signup" />; }
