// Form screens sit in the middle of the display on large screens (lg:my-auto
// inside the shell's flex column); taller content just flows from the top.
export default function DispatcherLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-xl lg:my-auto">{children}</div>;
}
