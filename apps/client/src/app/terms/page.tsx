import Link from "next/link";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "DeepKhata";

export const metadata = {
  title: `Terms of Service and Privacy - ${APP_NAME}`,
};

export default function TermsPage() {
  return (
    <main
      data-testid="terms-page"
      className="mx-auto max-w-3xl px-5 py-12 text-slate-800"
    >
      <h1 className="text-3xl font-bold text-slate-900">
        Terms of Service and Privacy
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Plain language, no tricks. This is how {APP_NAME} works with your shop
        data.
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">Terms of Service</h2>
        <p>
          {APP_NAME} is a tool to run your shop: sales, stock, khata (udhar),
          galla and reports. Your shop data, including your customers, lena and
          dena, belongs to you.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            You are responsible for the accuracy of what you enter and for who
            you give access to (your owner, manager and staff accounts).
          </li>
          <li>
            Plans and limits (users, products, branches) apply as shown in
            Settings. If a subscription expires, your account becomes read-only
            so you can still see and export your records; nothing is deleted.
          </li>
          <li>
            Do not use the service for anything unlawful or to disturb other
            shops using it.
          </li>
          <li>
            You can ask us to delete your shop and its data at any time.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">Privacy</h2>
        <p>
          What the provider ({APP_NAME}) can see, and why:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            We can see usage and aggregate sales metrics for your shop, such as
            number of orders, sales totals, products and active users. We use
            them for billing, support and to enforce your plan limits.
          </li>
          <li>
            We never share these metrics, or any of your data, with third
            parties. We do not sell data.
          </li>
          <li>
            If our support team needs to look inside your account to help you,
            they use a read-only view. They cannot change anything. Every
            support access is logged and you can see it yourself in Settings,
            under Access log.
          </li>
          <li>
            Your customers&apos; phone numbers and balances stay inside your
            shop. We only use them to run the features you switch on, such as
            payment reminders.
          </li>
        </ul>
      </section>

      <p className="mt-10 text-sm text-slate-500">
        Questions? Contact {APP_NAME} support from the app.{" "}
        <Link href="/" className="text-emerald-700 underline">
          Back to home
        </Link>
      </p>
    </main>
  );
}
