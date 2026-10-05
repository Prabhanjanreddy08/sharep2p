import React from "react";
import { Layout } from "./Layout";
import { BackButton } from "./BackButton";

export function PageContainer({
  children,
  eyebrow,
  title,
  description,
  centered = false,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  centered?: boolean;
}) {
  return (
    <Layout>
      <main className="mx-auto w-full max-w-5xl min-w-0 px-4 pb-20 pt-8 sm:px-8 sm:pt-12">
        <BackButton />
        <div className={`sf-rise min-w-0 ${centered ? "mx-auto max-w-xl text-center" : "max-w-2xl"}`}>
          <span className="font-mono-ui text-[10px] font-bold uppercase tracking-[.18em] text-accent">
            {eyebrow}
          </span>
          <h1 className="mt-4 font-display text-5xl leading-[.95] tracking-[-.045em] text-primary sm:text-7xl">
            {title}
          </h1>
          <p className={`mt-6 text-sm leading-6 text-muted-foreground ${centered ? "mx-auto max-w-md" : "max-w-md"}`}>{description}</p>
        </div>
        {children}
      </main>
    </Layout>
  );
}
