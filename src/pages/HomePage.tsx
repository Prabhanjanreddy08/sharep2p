import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import {
  Upload,
  ArrowRight,
  MonitorDown,
  MonitorUp,
  Smartphone,
  ShieldCheck,
  CloudOff,
  LockKeyhole,
  Package,
  Zap,
} from "lucide-react";

export function HomePage() {
  return (
    <Layout>
      <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col px-5 pb-16 pt-10 sm:px-8 sm:pt-16">
        <section className="grid w-full min-w-0 items-end gap-12 lg:grid-cols-[1.1fr_.9fr] lg:gap-20">
          <div className="sf-rise">
            <div className="mb-7 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-accent">
              <span className="h-2 w-2 rounded-full bg-accent" />
              Nearby transfer, rethought
            </div>
            <h1 className="max-w-3xl text-balance font-display text-[clamp(3.8rem,9vw,7.8rem)] leading-[.86] tracking-[-0.055em] text-primary">
              Move it.
              <br />
              <em className="text-accent">Don't upload it.</em>
            </h1>
            <p className="mt-8 max-w-md text-base leading-7 text-muted-foreground sm:text-lg">
              ShareFast moves files directly between devices. No account, no cloud, no trace left behind.
            </p>
          </div>

          <div className="sf-rise sf-rise-1 relative lg:pb-3">
            <div className="group sf-grid relative cursor-pointer overflow-hidden rounded-[2rem] border border-border bg-secondary p-5 transition-all duration-300 hover:border-accent/40 hover:shadow-xl sm:p-7">
              <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full border-[30px] border-accent/30 transition-transform duration-700 ease-out group-hover:scale-110" />
              <div className="absolute -bottom-16 -left-12 h-40 w-40 rounded-full border-[22px] border-primary/10 transition-transform duration-700 ease-out group-hover:scale-110" />

              <div className="relative">
                <div className="mb-12 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-ui text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground transition-colors group-hover:text-accent">
                      A private lane
                    </span>
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono-ui text-[9px] font-bold uppercase tracking-wider text-accent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      Reversible
                    </span>
                  </div>
                  <LockKeyhole size={16} className="text-primary transition-colors duration-300 group-hover:text-accent" />
                </div>

                <div className="flex items-center justify-between gap-4">
                  {/* Phone box: Default sender, on hover becomes receiver */}
                  <div className="grid h-20 w-20 place-items-center rounded-2xl border border-border bg-card text-primary shadow-lg transition-all duration-500 ease-out group-hover:scale-95 group-hover:border-border/60 group-hover:shadow-none group-hover:opacity-75">
                    <Smartphone size={30} className="transition-transform duration-500 group-hover:-translate-x-0.5" />
                  </div>

                  {/* Flow line + Spinning arrow that reverses 180° */}
                  <div className="flex flex-1 items-center gap-2">
                    <span className="h-px flex-1 border-t border-dashed border-primary/40 transition-colors duration-300 group-hover:border-accent/60" />
                    <span className="sf-pulse grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-foreground shadow-md transition-transform duration-500 ease-out group-hover:rotate-180">
                      <ArrowRight size={15} />
                    </span>
                    <span className="h-px flex-1 border-t border-dashed border-primary/40 transition-colors duration-300 group-hover:border-accent/60" />
                  </div>

                  {/* Laptop box: Default receiver, on hover becomes highlighted sender */}
                  <div className="grid h-20 w-20 place-items-center rounded-2xl border border-border bg-card text-primary transition-all duration-500 ease-out group-hover:scale-105 group-hover:border-accent/50 group-hover:shadow-lg group-hover:shadow-accent/10">
                    <MonitorUp size={30} className="transition-all duration-500 group-hover:translate-x-0.5 group-hover:text-accent" />
                  </div>
                </div>

                <div className="mt-9 flex items-center justify-between">
                  <span className="text-sm font-bold text-primary transition-colors duration-300 group-hover:text-muted-foreground">
                    Phone
                  </span>
                  <span className="font-mono-ui text-[10px] text-muted-foreground transition-colors duration-300 group-hover:text-accent">
                    <span className="group-hover:hidden">DIRECT / 0.0 MB</span>
                    <span className="hidden font-bold group-hover:inline">REVERSE / 0.0 MB</span>
                  </span>
                  <span className="text-sm font-bold text-primary transition-colors duration-300 group-hover:text-accent">
                    Your laptop
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Action cards (all with crisp borders, solid opaque backgrounds, no new badge) ─── */}
        <section className="sf-rise sf-rise-2 mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Link
            to="/send"
            className="group flex min-h-[210px] flex-col justify-between rounded-[1.6rem] border border-border bg-card p-6 text-primary transition-all hover:-translate-y-1 hover:border-accent/40 hover:shadow-lg sm:p-8"
            data-testid="link-send-file"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-secondary text-primary">
                <Upload size={20} />
              </span>
              <ArrowRight className="text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-accent" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.04em]">Send a file</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">Pick it here, scan it there.</p>
            </div>
          </Link>

          <Link
            to="/receive"
            className="group flex min-h-[210px] flex-col justify-between rounded-[1.6rem] border border-border bg-card p-6 text-primary transition-all hover:-translate-y-1 hover:border-accent/40 hover:shadow-lg sm:p-8"
            data-testid="link-receive-file"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-secondary text-primary">
                <MonitorDown size={20} />
              </span>
              <ArrowRight className="text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-accent" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.04em]">Receive a file</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">Scan a code or enter six digits.</p>
            </div>
          </Link>

          <Link
            to="/lifedrop/create"
            className="group flex min-h-[210px] flex-col justify-between rounded-[1.6rem] border border-border bg-card p-6 text-primary transition-all hover:-translate-y-1 hover:border-accent/40 hover:shadow-lg sm:p-8"
            data-testid="link-lifedrop"
          >
            <div className="flex items-start justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-secondary text-primary">
                <Package size={20} />
              </span>
              <ArrowRight className="text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-accent" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.04em]">LifeDrop</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Pack files, text, links, notes — ship it all as one temporary drop.
              </p>
            </div>
          </Link>
        </section>

        <section className="mt-16 grid gap-8 border-t border-border pt-8 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex gap-3">
            <Zap className="shrink-0 text-accent" size={18} />
            <span>
              <strong className="text-primary">Gigabit LAN Speed.</strong>
              <br />
              100MB/s–1GB/s link over Wi-Fi / Hotspot.
            </span>
          </div>

          <div className="flex gap-3">
            <ShieldCheck className="shrink-0 text-accent" size={18} />
            <span>
              <strong className="text-primary">Direct P2P.</strong>
              <br />
              Direct device-to-device streaming.
            </span>
          </div>

          <div className="flex gap-3">
            <CloudOff className="shrink-0 text-accent" size={18} />
            <span>
              <strong className="text-primary">Zero Internet.</strong>
              <br />
              0 KB data used on local transfers.
            </span>
          </div>

          <div className="flex gap-3">
            <LockKeyhole className="shrink-0 text-accent" size={18} />
            <span>
              <strong className="text-primary">One time.</strong>
              <br />
              Sessions expire when you're done.
            </span>
          </div>
        </section>
      </main>
    </Layout>
  );
}
