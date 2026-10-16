import Link from "next/link";
import SEO from "../components/SEO";
import SiteHeader from "../components/layout/SiteHeader";
import SiteFooter from "../components/layout/SiteFooter";
import { PrimaryButton } from "../components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-bg font-body text-ink">
      <SEO title="Page not found" path="/404" noindex />
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <div className="text-6xl font-semibold text-brand">404</div>
          <h1 className="mt-3 text-xl font-semibold text-ink">This page drifted out of orbit</h1>
          <p className="mt-2 text-sm text-muted">
            The link may be broken or the page may have moved. Head back to the store to keep
            browsing.
          </p>
          <Link href="/" className="mt-6 inline-block">
            <PrimaryButton type="button">Back to store</PrimaryButton>
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
