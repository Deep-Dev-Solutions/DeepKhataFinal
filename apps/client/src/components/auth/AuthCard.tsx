import type { ReactNode } from "react";
import { Store } from "lucide-react";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "DeepKhata";

/** Shared centered card used by the public account screens. */
export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 py-12 font-sans sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="rounded-md bg-brand-700 p-2">
            <Store className="h-6 w-6 text-white" />
          </div>
          <span className="text-heading font-semibold tracking-tight text-gray-900">
            {APP_NAME}
          </span>
        </div>
        <h2 className="mt-2 text-center text-heading font-semibold text-gray-900">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-center text-body text-gray-500">{subtitle}</p>
        )}
      </div>
      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="rounded-lg border border-border bg-card px-4 py-6 shadow-sm sm:rounded-lg sm:px-8">
          {children}
        </div>
      </div>
    </div>
  );
}
