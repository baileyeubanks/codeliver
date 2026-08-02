import Link from "next/link";
import CoProductionBrand from "@/components/brand/CoProductionBrand";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#edf1f4] px-4 py-10 text-[#18223e]">
      <div className="mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-[456px] flex-col items-center justify-center">
        <section className="w-full rounded-lg border border-[#d9e1e9] bg-white px-6 py-8 text-center shadow-[0_12px_34px_rgba(32,55,88,0.08)]">
          <CoProductionBrand
            className="mx-auto mb-5"
            variant="stacked"
            sizes="(max-width: 520px) 188px, 212px"
            priority
          />
          <p className="mb-2 text-[10px] font-bold uppercase text-[#145bb8]">Workspace route</p>
          <h1 className="mb-2 font-[Manrope,Inter,sans-serif] text-[25px] font-bold leading-tight">
            Page not found
          </h1>
          <p className="mx-auto mb-6 max-w-[320px] text-sm leading-6 text-[#647287]">
            This workspace view is not available from the current link.
          </p>
          <Link
            href="/projects"
            className="inline-flex min-h-11 items-center justify-center rounded-[7px] border border-[#145bb8] bg-[#145bb8] px-5 text-sm font-bold text-white transition-colors hover:bg-[#0c4ba2]"
          >
            Back to projects
          </Link>
        </section>
      </div>
    </main>
  );
}
